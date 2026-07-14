-- Integrations platform: outbound webhooks, delivery outbox, API keys

-- 1) Webhook endpoints (global when form_id is null; form-scoped when set)
create table if not exists public.integration_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_id uuid references public.forms(id) on delete cascade,
  name text not null,
  url text not null,
  secret text not null,
  events text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint integration_webhook_endpoints_name_len check (char_length(trim(name)) >= 1),
  constraint integration_webhook_endpoints_url_len check (char_length(trim(url)) >= 8),
  constraint integration_webhook_endpoints_secret_len check (char_length(secret) >= 16),
  constraint integration_webhook_endpoints_events_nonempty check (cardinality(events) >= 1)
);

create index if not exists integration_webhook_endpoints_company_idx
  on public.integration_webhook_endpoints(company_id)
  where deleted_at is null;

create index if not exists integration_webhook_endpoints_form_idx
  on public.integration_webhook_endpoints(form_id)
  where form_id is not null and deleted_at is null;

create index if not exists integration_webhook_endpoints_events_idx
  on public.integration_webhook_endpoints using gin (events)
  where deleted_at is null and is_active = true;

-- 2) Delivery outbox
create table if not exists public.integration_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  endpoint_id uuid not null references public.integration_webhook_endpoints(id) on delete cascade,
  event_type text not null,
  event_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  response_status integer,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_delivery_status_check check (
    status in ('pending', 'processing', 'sent', 'failed', 'dead')
  ),
  constraint integration_delivery_event_type_len check (char_length(event_type) >= 3),
  constraint integration_delivery_event_key_len check (char_length(event_key) >= 3)
);

create unique index if not exists integration_delivery_endpoint_event_key_unique
  on public.integration_delivery_outbox(endpoint_id, event_key);

create index if not exists integration_delivery_outbox_work_idx
  on public.integration_delivery_outbox(status, next_attempt_at)
  where status in ('pending', 'failed');

create index if not exists integration_delivery_outbox_company_created_idx
  on public.integration_delivery_outbox(company_id, created_at desc);

-- 3) API keys (plaintext only shown once at create; store hash)
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint api_keys_name_len check (char_length(trim(name)) >= 1),
  constraint api_keys_prefix_len check (char_length(key_prefix) >= 8),
  constraint api_keys_scopes_nonempty check (cardinality(scopes) >= 1)
);

create unique index if not exists api_keys_key_hash_unique
  on public.api_keys(key_hash);

create index if not exists api_keys_company_idx
  on public.api_keys(company_id)
  where revoked_at is null;

-- 4) Claim batch for workers
create or replace function public.claim_integration_delivery_batch(batch_size integer default 25)
returns setof public.integration_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select id
    from public.integration_delivery_outbox
    where status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempts < 8
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.integration_delivery_outbox delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_integration_delivery_batch(integer) from public;
grant execute on function public.claim_integration_delivery_batch(integer) to service_role;
-- App uses POSTGRES_URL (often superuser/service); also allow authenticated if using pooler role
grant execute on function public.claim_integration_delivery_batch(integer) to authenticated;

-- 5) RLS + triggers
do $$
declare
  table_name text;
  managed_tables text[] := array[
    'integration_webhook_endpoints',
    'integration_delivery_outbox',
    'api_keys'
  ];
begin
  foreach table_name in array managed_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    if table_name <> 'api_keys' then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        table_name || '_set_updated_at',
        table_name
      );
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' company access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || ' company access',
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;
