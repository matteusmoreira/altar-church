-- Fase 4: metas e alertas configuráveis de saúde das células.

create table if not exists public.cell_health_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  absence_days integer not null default 30,
  growth_target integer not null default 0,
  alerts_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cell_health_settings_unique unique (company_id, group_id),
  constraint cell_health_absence_days_check check (absence_days between 7 and 365),
  constraint cell_health_growth_target_check check (growth_target between 0 and 100000)
);

create index if not exists cell_health_settings_group_idx on public.cell_health_settings(company_id, group_id);
drop trigger if exists cell_health_settings_set_updated_at on public.cell_health_settings;
create trigger cell_health_settings_set_updated_at before update on public.cell_health_settings
for each row execute function public.set_updated_at();

alter table public.cell_health_settings enable row level security;
drop policy if exists cell_health_settings_company_access on public.cell_health_settings;
create policy cell_health_settings_company_access on public.cell_health_settings
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update, delete on public.cell_health_settings to authenticated;
analyze public.cell_health_settings;
