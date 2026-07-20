-- Recupera o fluxo operacional do Voluntariado: pessoa existente, funcoes por id,
-- planejamento por culto e geracao idempotente de vagas.

alter table public.volunteer_schedule_template_slots
  add column if not exists role_id uuid references public.volunteer_department_roles(id) on delete restrict,
  add column if not exists instructions text not null default '';

insert into public.volunteer_department_roles(company_id, department_id, name)
select distinct slot.company_id, slot.department_id, slot.role_name
from public.volunteer_schedule_template_slots slot
where not exists (
  select 1 from public.volunteer_department_roles role
  where role.department_id = slot.department_id
    and lower(role.name) = lower(slot.role_name)
    and role.deleted_at is null
)
on conflict (department_id, name) do nothing;

update public.volunteer_schedule_template_slots slot
set role_id = role.id,
    role_name = role.name
from public.volunteer_department_roles role
where role.department_id = slot.department_id
  and lower(role.name) = lower(slot.role_name)
  and slot.role_id is null
  and role.deleted_at is null;

create unique index if not exists volunteer_memberships_role_unique
  on public.volunteer_department_memberships(department_id, volunteer_id, role_id)
  where role_id is not null;

create table if not exists public.volunteer_event_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete restrict,
  role_id uuid not null references public.volunteer_department_roles(id) on delete restrict,
  role_name text not null,
  required_volunteers integer not null default 1,
  instructions text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_event_positions_required_check check (required_volunteers between 1 and 100),
  constraint volunteer_event_positions_unique unique (event_id, department_id, role_id)
);

alter table public.volunteer_shifts
  add column if not exists event_position_id uuid references public.volunteer_event_positions(id) on delete cascade;

alter table public.events
  add column if not exists volunteer_schedule_published_at timestamptz;

create unique index if not exists volunteer_shifts_event_position_unique
  on public.volunteer_shifts(schedule_id, event_id, event_position_id)
  where event_position_id is not null;

create index if not exists volunteer_event_positions_event_idx
  on public.volunteer_event_positions(company_id, event_id, sort_order);

alter table public.volunteer_event_positions enable row level security;

drop policy if exists "volunteer event positions scoped read" on public.volunteer_event_positions;
create policy "volunteer event positions scoped read"
  on public.volunteer_event_positions for select to authenticated
  using (
    public.can_manage_volunteer_company(company_id)
    or public.can_manage_volunteer_department(department_id)
    or exists (
      select 1
      from public.volunteer_department_memberships membership
      join public.volunteer_profiles volunteer on volunteer.id = membership.volunteer_id
      join public.profiles profile on profile.person_id = volunteer.person_id
      where membership.department_id = volunteer_event_positions.department_id
        and profile.id = auth.uid()
        and membership.is_active
    )
  );

revoke all on public.volunteer_event_positions from anon;
grant select on public.volunteer_event_positions to authenticated;

drop trigger if exists set_volunteer_event_positions_updated_at on public.volunteer_event_positions;
create trigger set_volunteer_event_positions_updated_at
before update on public.volunteer_event_positions
for each row execute function public.set_updated_at();
