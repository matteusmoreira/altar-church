-- Fase 1: campanhas multicanal, snapshot imutável e entrega rastreável.

alter table public.notifications
  add column if not exists audience_kind text not null default 'all',
  add column if not exists audience_ref_id uuid,
  add column if not exists audience_person_ids jsonb not null default '[]'::jsonb,
  add column if not exists scheduled_at timestamptz,
  add column if not exists snapshot_at timestamptz,
  add column if not exists snapshot_count integer not null default 0,
  add column if not exists completed_at timestamptz,
  add column if not exists canceled_at timestamptz;

alter table public.notifications drop constraint if exists notifications_method_check;
alter table public.notifications
  add constraint notifications_method_check
  check (method in ('push', 'email', 'whatsapp', 'sms'));

alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications
  add constraint notifications_status_check
  check (status in ('sent', 'scheduled', 'draft', 'queued', 'processing', 'completed', 'failed', 'canceled'));

alter table public.notifications drop constraint if exists notifications_audience_kind_check;
alter table public.notifications
  add constraint notifications_audience_kind_check
  check (audience_kind in ('all', 'cell', 'ministry', 'visitors', 'birthdays', 'manual'));

alter table public.notifications
  add constraint notifications_audience_person_ids_array_check
  check (jsonb_typeof(audience_person_ids) = 'array');

create index if not exists notifications_company_scheduled_idx
  on public.notifications(company_id, scheduled_at)
  where deleted_at is null and status in ('scheduled', 'queued', 'processing');

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  channel text not null,
  recipient text not null,
  recipient_name text not null default '',
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  response_status integer,
  provider_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivery_key text not null,
  constraint notification_delivery_channel_check check (channel in ('push', 'email', 'whatsapp')),
  constraint notification_delivery_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'canceled', 'dead')),
  constraint notification_delivery_attempts_check check (attempts >= 0),
  constraint notification_delivery_key_unique unique (delivery_key)
);

create index if not exists notification_deliveries_work_idx
  on public.notification_deliveries(company_id, status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists notification_deliveries_campaign_idx
  on public.notification_deliveries(notification_id, status, created_at);
create index if not exists notification_deliveries_person_idx
  on public.notification_deliveries(company_id, person_id, created_at desc);

create table if not exists public.notification_channel_preferences (
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  channel text not null,
  opted_out boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, person_id, channel),
  constraint notification_preference_channel_check check (channel in ('push', 'email', 'whatsapp'))
);

create index if not exists notification_channel_preferences_person_idx
  on public.notification_channel_preferences(company_id, person_id, channel, opted_out);

create table if not exists public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_push_endpoint_unique unique (endpoint)
);

create index if not exists notification_push_subscriptions_person_idx
  on public.notification_push_subscriptions(company_id, person_id, is_active);

create or replace function public.claim_notification_delivery_batch(batch_size integer default 25)
returns setof public.notification_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with eligible as (
    select delivery.id
    from public.notification_deliveries delivery
    where delivery.status in ('pending', 'failed')
      and delivery.next_attempt_at <= now()
      and delivery.attempts < 8
      and (
        select count(*)
        from public.notification_deliveries same_tenant
        where same_tenant.company_id = delivery.company_id
          and same_tenant.status in ('pending', 'failed')
          and same_tenant.next_attempt_at <= now()
          and same_tenant.attempts < 8
          and (same_tenant.next_attempt_at, same_tenant.created_at, same_tenant.id)
            <= (delivery.next_attempt_at, delivery.created_at, delivery.id)
      ) <= greatest(1, least(batch_size, 25))
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.notification_deliveries delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from eligible
  where delivery.id = eligible.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_notification_delivery_batch(integer) from public;
grant execute on function public.claim_notification_delivery_batch(integer) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'notification_deliveries',
    'notification_channel_preferences',
    'notification_push_subscriptions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_company_access',
      table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || '_company_access',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update on public.notification_deliveries to authenticated;
grant select, insert, update, delete on public.notification_channel_preferences to authenticated;
grant select, insert, update, delete on public.notification_push_subscriptions to authenticated;

analyze public.notifications;
analyze public.notification_deliveries;
analyze public.notification_channel_preferences;
analyze public.notification_push_subscriptions;
