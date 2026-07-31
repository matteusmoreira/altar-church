-- Gestao de Ministerios 2.0: contrato aditivo, escopo, workspace e operacao.

alter table public.ministries
  add column if not exists ministry_type text not null default 'other',
  add column if not exists mission text not null default '',
  add column if not exists target_audience text not null default '',
  add column if not exists meeting_day smallint,
  add column if not exists meeting_time time,
  add column if not exists meeting_location text not null default '',
  add column if not exists image_file_id uuid references public.app_files(id) on delete set null,
  add column if not exists public_join_enabled boolean not null default true;

alter table public.ministries drop constraint if exists ministries_type_check;
alter table public.ministries add constraint ministries_type_check
  check (ministry_type in ('worship', 'kids', 'youth', 'care', 'discipleship', 'outreach', 'administration', 'other'));
alter table public.ministries drop constraint if exists ministries_meeting_day_check;
alter table public.ministries add constraint ministries_meeting_day_check
  check (meeting_day is null or meeting_day between 0 and 6);

alter table public.ministry_memberships
  add column if not exists left_at timestamptz;
alter table public.ministry_memberships drop constraint if exists ministry_memberships_role_check;
alter table public.ministry_memberships add constraint ministry_memberships_role_check
  check (role in ('member', 'leader', 'coordinator'));
create index if not exists ministry_memberships_ministry_status_idx
  on public.ministry_memberships(company_id, ministry_id, status, role);
create index if not exists ministry_memberships_ministry_role_idx
  on public.ministry_memberships(ministry_id, role, status);

-- Lider atual permanece fonte de verdade e ganha vinculo historico ativo.
insert into public.ministry_memberships (
  company_id, ministry_id, person_id, role, status, joined_at, reviewed_at
)
select ministry.company_id, ministry.id, ministry.leader_person_id, 'leader', 'active', now(), now()
from public.ministries ministry
where ministry.leader_person_id is not null
  and ministry.deleted_at is null
on conflict (ministry_id, person_id) do update
set role = 'leader', status = 'active', left_at = null,
    joined_at = coalesce(public.ministry_memberships.joined_at, excluded.joined_at),
    reviewed_at = coalesce(public.ministry_memberships.reviewed_at, excluded.reviewed_at),
    updated_at = now();

alter table public.groups
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;
alter table public.groups drop constraint if exists groups_ministry_type_link_check;
alter table public.groups add constraint groups_ministry_type_link_check
  check (type <> 'ministry' or ministry_id is not null) not valid;
create index if not exists groups_company_ministry_active_idx
  on public.groups(company_id, ministry_id, is_active, created_at desc)
  where deleted_at is null;
create unique index if not exists groups_ministry_name_unique
  on public.groups(company_id, ministry_id, lower(btrim(name)))
  where type = 'ministry' and ministry_id is not null and deleted_at is null;

alter table public.programmings
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;
alter table public.events
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;
create index if not exists programmings_company_ministry_date_idx
  on public.programmings(company_id, ministry_id, starts_at desc)
  where deleted_at is null;
create index if not exists events_company_ministry_date_idx
  on public.events(company_id, ministry_id, starts_at desc)
  where deleted_at is null;

update public.events event
set ministry_id = programming.ministry_id
from public.programmings programming
where event.programming_id = programming.id
  and event.ministry_id is null
  and programming.ministry_id is not null;

create or replace function public.sync_event_ministry_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.programming_id is not null then
    select programming.ministry_id
      into new.ministry_id
    from public.programmings programming
    where programming.id = new.programming_id;
  end if;
  return new;
end;
$$;
drop trigger if exists events_sync_ministry_id on public.events;
create trigger events_sync_ministry_id
before insert or update of programming_id on public.events
for each row execute function public.sync_event_ministry_id();

alter table public.person_follow_up_tasks
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;
alter table public.person_follow_up_tasks drop constraint if exists person_follow_up_task_origin_check;
alter table public.person_follow_up_tasks add constraint person_follow_up_task_origin_check check (origin in (
  'manual', 'public_form', 'new_visitor', 'visitor_without_contact', 'recurring_absence',
  'new_prayer_request', 'without_cell', 'without_portal_access',
  'ministry_absence', 'ministry_onboarding', 'ministry_manual'
));
create index if not exists person_follow_up_tasks_ministry_status_due_idx
  on public.person_follow_up_tasks(company_id, ministry_id, status, due_at)
  where deleted_at is null and ministry_id is not null;

alter table public.notifications drop constraint if exists notifications_audience_kind_check;
alter table public.notifications add constraint notifications_audience_kind_check
  check (audience_kind in ('all', 'cell', 'ministry', 'ministry_team', 'visitors', 'birthdays', 'manual'));

create unique index if not exists attendance_ministry_person_event_unique
  on public.attendance_records(company_id, event_ref_id, person_id, event_type)
  where deleted_at is null and event_type = 'ministry' and person_id is not null and event_ref_id is not null;

-- Fase 5: checklist por ministerio, progresso individual e recursos.
create table if not exists public.ministry_onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.ministry_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.ministry_onboarding_templates(id) on delete cascade,
  title text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.ministry_member_onboarding (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  membership_id uuid not null references public.ministry_memberships(id) on delete cascade,
  step_id uuid not null references public.ministry_onboarding_steps(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministry_member_onboarding_unique unique (membership_id, step_id)
);
create table if not exists public.ministry_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'geral',
  file_id uuid references public.app_files(id) on delete set null,
  external_url text,
  visibility text not null default 'members',
  sort_order integer not null default 0,
  author_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint ministry_resources_target_check check (file_id is not null or nullif(btrim(external_url), '') is not null),
  constraint ministry_resources_visibility_check check (visibility in ('leaders', 'members', 'public'))
);
create index if not exists ministry_onboarding_templates_scope_idx
  on public.ministry_onboarding_templates(company_id, ministry_id, is_active)
  where deleted_at is null;
create index if not exists ministry_onboarding_steps_template_idx
  on public.ministry_onboarding_steps(template_id, sort_order)
  where deleted_at is null;
create index if not exists ministry_member_onboarding_scope_idx
  on public.ministry_member_onboarding(company_id, ministry_id, membership_id);
create index if not exists ministry_resources_scope_idx
  on public.ministry_resources(company_id, ministry_id, visibility, sort_order)
  where deleted_at is null;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'ministry_onboarding_templates', 'ministry_onboarding_steps',
    'ministry_member_onboarding', 'ministry_resources'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;

-- Enforce team membership against active ministry membership server-side in DB too.
create or replace function public.ensure_ministry_group_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare group_row record;
begin
  select id, company_id, ministry_id, type into group_row
  from public.groups where id = new.group_id;
  if group_row.type = 'ministry' then
    if new.company_id <> group_row.company_id or not exists (
      select 1 from public.ministry_memberships membership
      where membership.company_id = group_row.company_id
        and membership.ministry_id = group_row.ministry_id
        and membership.person_id = new.person_id
        and membership.status = 'active'
        and membership.left_at is null
    ) then
      raise exception 'Pessoa precisa ser membro ativo do ministerio antes de entrar na equipe';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists group_members_ministry_member_guard on public.group_members;
create trigger group_members_ministry_member_guard
before insert or update of group_id, person_id, company_id, status on public.group_members
for each row execute function public.ensure_ministry_group_member();

-- Ausencia nao justificada repetida cria uma tarefa deduplicada no Pessoa 360.
create or replace function public.create_ministry_absence_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare ministry_id_value uuid; absence_count integer; source_key_value text;
begin
  if new.event_type <> 'ministry' or new.status <> 'absent' or new.person_id is null or new.event_ref_id is null then
    return new;
  end if;
  select event.ministry_id into ministry_id_value from public.events event
  where event.id = new.event_ref_id and event.deleted_at is null;
  if ministry_id_value is null then return new; end if;
  select count(*) into absence_count from public.attendance_records record
  where record.company_id = new.company_id and record.person_id = new.person_id
    and record.event_type = 'ministry' and record.status = 'absent'
    and record.deleted_at is null and record.occurred_on >= current_date - 30;
  if absence_count < 2 then return new; end if;
  source_key_value := 'ministry_absence:' || ministry_id_value::text || ':' || new.person_id::text || ':' || to_char(current_date, 'YYYY-MM');
  insert into public.person_follow_up_tasks (
    company_id, person_id, ministry_id, title, notes, due_at, priority, status, origin, source_key
  ) values (
    new.company_id, new.person_id, ministry_id_value, 'Acompanhar ausencias no ministerio',
    'Pessoa teve duas ou mais ausencias nao justificadas nos ultimos 30 dias.', now() + interval '2 days',
    'high', 'open', 'ministry_absence', source_key_value
  ) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists attendance_ministry_follow_up on public.attendance_records;
create trigger attendance_ministry_follow_up
after insert or update of status on public.attendance_records
for each row execute function public.create_ministry_absence_follow_up();

-- RLS: remove politicas amplas para as tabelas com escopo ministerial e recria-las.
do $$
declare policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array['ministry_memberships','groups','group_members','programmings','events','attendance_records','person_follow_up_tasks','ministry_onboarding_templates','ministry_onboarding_steps','ministry_member_onboarding','ministry_resources'])
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

create or replace function public.ministry_current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where auth_user_id = (select auth.uid()) and active = true limit 1
$$;
create or replace function public.ministry_current_person_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select person_id from public.profiles where id = (select public.ministry_current_profile_id()) and active = true limit 1
$$;
create or replace function public.can_access_ministry(target_ministry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select public.ministry_current_profile_id())
      and profile.active = true and profile.role in ('superadmin','admin','pastor')
  ) or exists (
    select 1 from public.ministry_memberships membership
    where membership.ministry_id = target_ministry_id
      and membership.person_id = (select public.ministry_current_person_id())
      and membership.status = 'active' and membership.left_at is null
  )
$$;
create or replace function public.can_manage_ministry(target_ministry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.id = (select public.ministry_current_profile_id())
      and profile.active = true and profile.role in ('superadmin','admin','pastor')
  ) or exists (
    select 1 from public.ministry_memberships membership
    where membership.ministry_id = target_ministry_id
      and membership.person_id = (select public.ministry_current_person_id())
      and membership.role in ('leader','coordinator')
      and membership.status = 'active' and membership.left_at is null
  )
$$;
create or replace function public.can_manage_ministry_team(target_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups group_row
    where group_row.id = target_group_id and group_row.type = 'ministry'
      and public.can_manage_ministry(group_row.ministry_id)
  )
$$;

alter table public.ministry_memberships enable row level security;
create policy ministry_memberships_scope on public.ministry_memberships for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id) and public.can_access_ministry(ministry_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id) and public.can_manage_ministry(ministry_id)));

alter table public.groups enable row level security;
create policy groups_scope_select on public.groups for select to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (type <> 'ministry' or public.can_access_ministry(ministry_id))));
create policy groups_scope_write on public.groups for insert to authenticated
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (type <> 'ministry' or public.can_manage_ministry(ministry_id))));
create policy groups_scope_update on public.groups for update to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (type <> 'ministry' or public.can_manage_ministry(ministry_id))))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (type <> 'ministry' or public.can_manage_ministry(ministry_id))));
create policy groups_scope_delete on public.groups for delete to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (type <> 'ministry' or public.can_manage_ministry(ministry_id))));

alter table public.group_members enable row level security;
create policy group_members_scope on public.group_members for all to authenticated
using ((select public.is_superadmin()) or exists (select 1 from public.groups group_row where group_row.id = group_id and public.is_company_member(group_row.company_id) and (group_row.type <> 'ministry' or public.can_access_ministry(group_row.ministry_id))))
with check ((select public.is_superadmin()) or exists (select 1 from public.groups group_row where group_row.id = group_id and public.is_company_member(group_row.company_id) and (group_row.type <> 'ministry' or public.can_manage_ministry(group_row.ministry_id))));

alter table public.programmings enable row level security;
create policy programmings_scope on public.programmings for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_access_ministry(ministry_id))))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_manage_ministry(ministry_id))));

alter table public.events enable row level security;
create policy events_scope on public.events for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_access_ministry(ministry_id))))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_manage_ministry(ministry_id))));

alter table public.attendance_records enable row level security;
create policy attendance_scope on public.attendance_records for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (event_type <> 'ministry' or exists (select 1 from public.events event where event.id = event_ref_id and public.can_access_ministry(event.ministry_id)))))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (event_type <> 'ministry' or exists (select 1 from public.events event where event.id = event_ref_id and public.can_manage_ministry(event.ministry_id)))));

alter table public.person_follow_up_tasks enable row level security;
create policy person_follow_up_tasks_scope on public.person_follow_up_tasks for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_access_ministry(ministry_id))))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (ministry_id is null or public.can_manage_ministry(ministry_id))));

alter table public.ministry_onboarding_templates enable row level security;
create policy ministry_onboarding_templates_scope on public.ministry_onboarding_templates for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_access_ministry(ministry_id)))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_manage_ministry(ministry_id)));
alter table public.ministry_onboarding_steps enable row level security;
create policy ministry_onboarding_steps_scope on public.ministry_onboarding_steps for all to authenticated
using ((select public.is_superadmin()) or exists (select 1 from public.ministry_onboarding_templates template where template.id = template_id and public.can_access_ministry(template.ministry_id)))
with check ((select public.is_superadmin()) or exists (select 1 from public.ministry_onboarding_templates template where template.id = template_id and public.can_manage_ministry(template.ministry_id)));
alter table public.ministry_member_onboarding enable row level security;
create policy ministry_member_onboarding_scope on public.ministry_member_onboarding for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_access_ministry(ministry_id)))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_manage_ministry(ministry_id)));
alter table public.ministry_resources enable row level security;
create policy ministry_resources_scope on public.ministry_resources for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_access_ministry(ministry_id)))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and public.can_manage_ministry(ministry_id)));

grant execute on function public.ministry_current_profile_id() to authenticated;
grant execute on function public.ministry_current_person_id() to authenticated;
grant execute on function public.can_access_ministry(uuid) to authenticated;
grant execute on function public.can_manage_ministry(uuid) to authenticated;
grant execute on function public.can_manage_ministry_team(uuid) to authenticated;
grant select, insert, update, delete on public.ministry_onboarding_templates to authenticated;
grant select, insert, update, delete on public.ministry_onboarding_steps to authenticated;
grant select, insert, update, delete on public.ministry_member_onboarding to authenticated;
grant select, insert, update, delete on public.ministry_resources to authenticated;

analyze public.ministries;
analyze public.ministry_memberships;
analyze public.groups;
analyze public.programmings;
analyze public.events;
analyze public.attendance_records;
analyze public.person_follow_up_tasks;
