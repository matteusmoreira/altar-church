-- Uazapi multi-tenant: instâncias por igreja, tokens no Vault e franquia por plano.

alter table public.system_plans
  add column if not exists uazapi_instance_limit integer not null default 1;

alter table public.system_plans
  drop constraint if exists system_plans_uazapi_instance_limit_check;
alter table public.system_plans
  add constraint system_plans_uazapi_instance_limit_check
  check (uazapi_instance_limit between 0 and 100);

create table if not exists public.uazapi_instances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_instance_id text not null,
  name text not null,
  status text not null default 'disconnected',
  profile_name text,
  phone text,
  vault_secret_id uuid not null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uazapi_instances_provider_id_nonempty check (char_length(trim(provider_instance_id)) > 0),
  constraint uazapi_instances_name_nonempty check (char_length(trim(name)) > 0),
  constraint uazapi_instances_status_check
    check (status in ('disconnected', 'connecting', 'connected', 'error')),
  constraint uazapi_instances_company_provider_unique unique (company_id, provider_instance_id)
);

create index if not exists uazapi_instances_company_active_idx
  on public.uazapi_instances(company_id, active, is_default desc, created_at)
  where active = true;

create unique index if not exists uazapi_instances_one_default_per_company_idx
  on public.uazapi_instances(company_id)
  where active = true and is_default = true;

drop trigger if exists uazapi_instances_set_updated_at on public.uazapi_instances;
create trigger uazapi_instances_set_updated_at
before update on public.uazapi_instances
for each row execute function public.set_updated_at();

alter table public.uazapi_instances enable row level security;

drop policy if exists "uazapi instances church admins read" on public.uazapi_instances;
create policy "uazapi instances church admins read"
on public.uazapi_instances for select to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.role in ('admin', 'superadmin')
      and (p.role = 'superadmin' or p.company_id = uazapi_instances.company_id)
  )
);

drop policy if exists "uazapi instances church admins manage" on public.uazapi_instances;
create policy "uazapi instances church admins manage"
on public.uazapi_instances for all to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.role in ('admin', 'superadmin')
      and (p.role = 'superadmin' or p.company_id = uazapi_instances.company_id)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.role in ('admin', 'superadmin')
      and (p.role = 'superadmin' or p.company_id = uazapi_instances.company_id)
  )
);

grant select, insert, update, delete on public.uazapi_instances to authenticated;
revoke all on public.uazapi_instances from anon;

create or replace function public.get_company_uazapi_credential(p_company_id uuid)
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
  where instance.company_id = p_company_id
    and instance.active = true
    and instance.status = 'connected'
  order by instance.is_default desc, instance.created_at
  limit 1;
end;
$$;

revoke all on function public.get_company_uazapi_credential(uuid) from public, anon, authenticated;
grant execute on function public.get_company_uazapi_credential(uuid) to service_role;

comment on table public.uazapi_instances is
  'Uazapi instances by church. Provider tokens are stored only in Supabase Vault.';
comment on column public.system_plans.uazapi_instance_limit is
  'Maximum active Uazapi instances allowed for each church on this plan.';
