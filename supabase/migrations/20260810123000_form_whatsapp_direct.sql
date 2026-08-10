-- Formulários: escolha entre webhook externo e mensagem direta pela instância UAZAPI da igreja.

alter table public.forms
  add column if not exists after_submit_mode text not null default 'webhook',
  add column if not exists whatsapp_instance_id uuid references public.uazapi_instances(id) on delete set null,
  add column if not exists whatsapp_message jsonb not null default '{}'::jsonb;

alter table public.forms drop constraint if exists forms_after_submit_mode_check;
alter table public.forms
  add constraint forms_after_submit_mode_check
  check (after_submit_mode in ('webhook', 'direct_message'));

create index if not exists forms_after_submit_mode_idx
  on public.forms(company_id, after_submit_mode)
  where deleted_at is null;

create table if not exists public.form_whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  submission_id uuid not null references public.form_submissions(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  uazapi_instance_id uuid references public.uazapi_instances(id) on delete set null,
  recipient text not null default '',
  recipient_name text not null default '',
  message_type text not null,
  message_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  response_status integer,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivery_key text not null,
  constraint form_whatsapp_delivery_type_check check (message_type in ('text', 'button', 'list', 'carousel')),
  constraint form_whatsapp_delivery_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'dead')),
  constraint form_whatsapp_delivery_attempts_check check (attempts >= 0),
  constraint form_whatsapp_delivery_key_unique unique (delivery_key)
);

create index if not exists form_whatsapp_deliveries_work_idx
  on public.form_whatsapp_deliveries(company_id, status, next_attempt_at, created_at)
  where status in ('pending', 'failed');

create index if not exists form_whatsapp_deliveries_form_idx
  on public.form_whatsapp_deliveries(company_id, form_id, created_at desc);

create index if not exists form_whatsapp_deliveries_submission_idx
  on public.form_whatsapp_deliveries(company_id, submission_id);

drop trigger if exists form_whatsapp_deliveries_set_updated_at on public.form_whatsapp_deliveries;
create trigger form_whatsapp_deliveries_set_updated_at
before update on public.form_whatsapp_deliveries
for each row execute function public.set_updated_at();

alter table public.form_whatsapp_deliveries enable row level security;
drop policy if exists "form whatsapp deliveries company access" on public.form_whatsapp_deliveries;
create policy "form whatsapp deliveries company access"
on public.form_whatsapp_deliveries
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update on public.form_whatsapp_deliveries to authenticated;

create or replace function public.claim_form_whatsapp_delivery_batch(batch_size integer default 25)
returns setof public.form_whatsapp_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with eligible as (
    select delivery.id
    from public.form_whatsapp_deliveries delivery
    where delivery.status in ('pending', 'failed')
      and delivery.next_attempt_at <= now()
      and delivery.attempts < 8
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.form_whatsapp_deliveries delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from eligible
  where delivery.id = eligible.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_form_whatsapp_delivery_batch(integer) from public;
grant execute on function public.claim_form_whatsapp_delivery_batch(integer) to service_role;

-- Permite que o worker obtenha somente o token da instância escolhida, nunca o navegador.
create or replace function public.get_uazapi_instance_credential(
  p_company_id uuid,
  p_instance_id uuid
)
returns table (
  instance_id uuid,
  provider_instance_id text,
  base_url text,
  instance_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
  select
    instance.id,
    instance.provider_instance_id,
    'https://whatpress.uazapi.com'::text,
    secret.decrypted_secret
  from public.uazapi_instances instance
  join vault.decrypted_secrets secret on secret.id = instance.vault_secret_id
  where instance.id = p_instance_id
    and instance.company_id = p_company_id
    and instance.active = true
    and instance.status = 'connected'
  limit 1;
end;
$$;

revoke all on function public.get_uazapi_instance_credential(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_uazapi_instance_credential(uuid, uuid) to service_role;

-- O bucket continua privado; o worker gera URL assinada por tentativa.
update storage.buckets
set allowed_mime_types = array(
  select distinct mime
  from unnest(coalesce(allowed_mime_types, array[]::text[]) || array['video/mp4']::text[]) as mime
)
where id = 'church-assets';
