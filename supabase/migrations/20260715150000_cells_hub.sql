-- Consolidate GCEUs into the canonical Cells module and add the cell portal.

alter table public.app_files add column if not exists purpose text not null default '';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role in (
    'superadmin', 'admin', 'pastor', 'ministry_leader', 'cell_supervisor',
    'cell_leader', 'communication', 'finance', 'volunteer', 'reader'
  )
);

-- Keep both historical person/profile links in sync for portal identity lookup.
update public.profiles profile
set person_id = person.id
from public.people person
where person.profile_id = profile.id
  and profile.person_id is null
  and person.deleted_at is null;

update public.people person
set profile_id = profile.id
from public.profiles profile
where profile.person_id = person.id
  and person.profile_id is null
  and person.deleted_at is null;

alter table public.group_studies
  add column if not exists description text not null default '',
  add column if not exists audience text not null default 'selected',
  add column if not exists file_id uuid references public.app_files(id) on delete set null;

alter table public.group_studies drop constraint if exists group_studies_audience_check;
alter table public.group_studies add constraint group_studies_audience_check check (audience in ('all', 'selected'));

create table if not exists public.cell_study_targets (
  study_id uuid not null references public.group_studies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (study_id, group_id)
);

alter table public.group_meetings
  add column if not exists checkin_opened_at timestamptz,
  add column if not exists checkin_closed_at timestamptz;

create table if not exists public.cell_checkin_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  meeting_id uuid not null references public.group_meetings(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cell_checkin_sessions_window_check check (opens_at < expires_at)
);

alter table public.attendance_records
  add column if not exists checkin_source text,
  add column if not exists checkin_session_id uuid references public.cell_checkin_sessions(id) on delete set null;

alter table public.attendance_records drop constraint if exists attendance_checkin_source_check;
alter table public.attendance_records add constraint attendance_checkin_source_check
  check (checkin_source is null or checkin_source in ('qr', 'manual'));

create unique index if not exists attendance_cell_meeting_person_unique_idx
  on public.attendance_records(company_id, event_ref_id, person_id)
  where event_type = 'cell' and person_id is not null and deleted_at is null;

create table if not exists public.cell_prayer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete cascade,
  author_person_id uuid not null references public.people(id) on delete cascade,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cell_prayer_requests_message_check check (char_length(btrim(message)) between 3 and 5000),
  constraint cell_prayer_requests_status_check check (status in ('open', 'praying', 'answered', 'archived'))
);

create table if not exists public.cell_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  audience text not null default 'selected',
  published_at timestamptz not null default now(),
  is_active boolean not null default true,
  author_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cell_notices_audience_check check (audience in ('all', 'selected')),
  constraint cell_notices_title_check check (char_length(btrim(title)) between 3 and 160),
  constraint cell_notices_content_check check (char_length(btrim(content)) between 3 and 10000)
);

create table if not exists public.cell_notice_targets (
  notice_id uuid not null references public.cell_notices(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (notice_id, group_id)
);

create index if not exists cell_checkin_sessions_meeting_idx on public.cell_checkin_sessions(meeting_id, expires_at desc);
create index if not exists cell_prayer_requests_group_idx on public.cell_prayer_requests(group_id, created_at desc) where deleted_at is null;
create index if not exists cell_notices_company_idx on public.cell_notices(company_id, published_at desc) where deleted_at is null;
create index if not exists cell_notice_targets_group_idx on public.cell_notice_targets(group_id, notice_id);
create index if not exists group_studies_file_idx on public.group_studies(file_id) where file_id is not null;
create index if not exists cell_study_targets_group_idx on public.cell_study_targets(group_id, study_id);

drop trigger if exists cell_prayer_requests_set_updated_at on public.cell_prayer_requests;
create trigger cell_prayer_requests_set_updated_at before update on public.cell_prayer_requests
for each row execute function public.set_updated_at();

drop trigger if exists cell_notices_set_updated_at on public.cell_notices;
create trigger cell_notices_set_updated_at before update on public.cell_notices
for each row execute function public.set_updated_at();

alter table public.cell_checkin_sessions enable row level security;
alter table public.cell_prayer_requests enable row level security;
alter table public.cell_notices enable row level security;
alter table public.cell_notice_targets enable row level security;
alter table public.cell_study_targets enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['cell_checkin_sessions', 'cell_prayer_requests', 'cell_notices', 'cell_notice_targets', 'cell_study_targets']
  loop
    execute format('drop policy if exists %I on public.%I', table_name || ' company access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || ' company access', table_name
    );
  end loop;
end $$;

grant select, insert, update, delete on public.cell_checkin_sessions to authenticated;
grant select, insert, update, delete on public.cell_prayer_requests to authenticated;
grant select, insert, update, delete on public.cell_notices to authenticated;
grant select, insert, update, delete on public.cell_notice_targets to authenticated;
grant select, insert, update, delete on public.cell_study_targets to authenticated;

create or replace function public.cell_current_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where auth_user_id = auth.uid() and active = true limit 1
$$;

create or replace function public.cell_current_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(profile.person_id, person.id)
  from public.profiles profile
  left join public.people person on person.profile_id = profile.id and person.deleted_at is null
  where profile.auth_user_id = auth.uid() and profile.active = true limit 1
$$;

create or replace function public.can_manage_cell(target_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.groups cell
    join public.profiles profile on profile.company_id = cell.company_id and profile.auth_user_id = auth.uid() and profile.active = true
    where cell.id = target_group_id and cell.type = 'cell' and cell.deleted_at is null
      and (profile.role in ('superadmin', 'admin')
        or (profile.role = 'cell_supervisor' and cell.coordinator_person_id = coalesce(profile.person_id, public.cell_current_person_id()))
        or (profile.role = 'cell_leader' and cell.leader_person_id = coalesce(profile.person_id, public.cell_current_person_id())))
  )
$$;

create or replace function public.is_cell_participant(target_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_members member
    join public.groups cell on cell.id = member.group_id
    where member.group_id = target_group_id and member.person_id = public.cell_current_person_id()
      and member.status = 'active' and cell.type = 'cell' and cell.deleted_at is null
  )
$$;

create or replace function public.can_access_cell_study(target_study_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_studies study
    left join public.cell_study_targets target on target.study_id = study.id
    where study.id = target_study_id and study.deleted_at is null and study.is_active = true
      and (
        (study.audience = 'all' and exists(
          select 1 from public.group_members member join public.groups cell on cell.id = member.group_id
          where member.person_id = public.cell_current_person_id() and member.status = 'active'
            and member.company_id = study.company_id and cell.type = 'cell' and cell.deleted_at is null
        ))
        or (target.group_id is not null and (public.can_manage_cell(target.group_id) or public.is_cell_participant(target.group_id)))
        or exists(
          select 1 from public.profiles profile
          where profile.auth_user_id = auth.uid() and profile.active = true
            and (profile.role = 'superadmin' or (profile.role = 'admin' and profile.company_id = study.company_id))
        )
      )
  )
$$;

create or replace function public.can_access_cell_meeting(target_meeting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_meetings meeting
    where meeting.id = target_meeting_id and meeting.deleted_at is null
      and (public.can_manage_cell(meeting.group_id) or public.is_cell_participant(meeting.group_id))
  )
$$;

drop policy if exists "cell_prayer_requests company access" on public.cell_prayer_requests;
create policy "Cell prayers readable by author or leadership" on public.cell_prayer_requests for select to authenticated
using ((select public.is_superadmin()) or author_profile_id = public.cell_current_profile_id() or public.can_manage_cell(group_id));
create policy "Cell prayers inserted by participants" on public.cell_prayer_requests for insert to authenticated
with check (author_profile_id = public.cell_current_profile_id() and author_person_id = public.cell_current_person_id() and public.is_cell_participant(group_id));
create policy "Cell prayers updated by leadership" on public.cell_prayer_requests for update to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id)) with check ((select public.is_superadmin()) or public.can_manage_cell(group_id));

drop policy if exists "cell_notices company access" on public.cell_notices;
create policy "Cell notices readable by audience" on public.cell_notices for select to authenticated
using ((select public.is_superadmin()) or exists(
  select 1 from public.cell_notice_targets target where target.notice_id = id
    and (public.can_manage_cell(target.group_id) or public.is_cell_participant(target.group_id))
) or (audience = 'all' and exists(
  select 1 from public.group_members member where member.company_id = cell_notices.company_id
    and member.person_id = public.cell_current_person_id() and member.status = 'active'
)));
create policy "Cell notices inserted by leadership" on public.cell_notices for insert to authenticated
with check ((select public.is_superadmin()) or exists(
  select 1 from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.company_id = cell_notices.company_id
    and profile.role in ('admin', 'cell_supervisor', 'cell_leader')
));
create policy "Cell notices updated by leadership" on public.cell_notices for update to authenticated
using ((select public.is_superadmin()) or author_profile_id = public.cell_current_profile_id());

drop policy if exists "cell_notice_targets company access" on public.cell_notice_targets;
create policy "Cell notice targets readable by audience" on public.cell_notice_targets for select to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id) or public.is_cell_participant(group_id));
create policy "Cell notice targets managed by leadership" on public.cell_notice_targets for all to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id))
with check ((select public.is_superadmin()) or public.can_manage_cell(group_id));

drop policy if exists "cell_study_targets company access" on public.cell_study_targets;
create policy "Cell study targets readable by audience" on public.cell_study_targets for select to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id) or public.is_cell_participant(group_id));
create policy "Cell study targets managed by leadership" on public.cell_study_targets for all to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id))
with check ((select public.is_superadmin()) or public.can_manage_cell(group_id));

drop policy if exists "cell_checkin_sessions company access" on public.cell_checkin_sessions;
create policy "Cell QR readable by church users" on public.cell_checkin_sessions for select to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));
create policy "Cell QR managed by leadership" on public.cell_checkin_sessions for all to authenticated
using ((select public.is_superadmin()) or public.can_manage_cell(group_id))
with check ((select public.is_superadmin()) or public.can_manage_cell(group_id));

drop policy if exists "App files are readable by company" on public.app_files;
create policy "App files are readable by authorized audience" on public.app_files for select to authenticated
using (
  (select public.is_superadmin())
  or (purpose not in ('study', 'gallery') and (select public.is_company_member(company_id)))
  or (purpose = 'study' and entity_id ~* '^[0-9a-f-]{36}$' and public.can_access_cell_study(entity_id::uuid))
  or (purpose = 'gallery' and entity_id ~* '^[0-9a-f-]{36}$' and public.can_access_cell_meeting(entity_id::uuid))
);

drop policy if exists "Church assets readable by company" on storage.objects;
create policy "Church assets readable by authorized audience" on storage.objects for select to authenticated
using (bucket_id = 'church-assets' and exists(
  select 1 from public.app_files file where file.bucket = storage.objects.bucket_id and file.storage_path = storage.objects.name
    and file.is_active = true and file.deleted_at is null
));

-- Study documents may reach 30 MB; application code keeps purpose-specific limits.
update storage.buckets
set file_size_limit = 31457280,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf', 'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
where id = 'church-assets';

-- Preserve enablement from the former groups module before removing it.
insert into public.company_modules (company_id, module_id, enabled)
select company_id, 'cells', enabled from public.company_modules where module_id = 'groups'
on conflict (company_id, module_id) do update set enabled = excluded.enabled, updated_at = now();

insert into public.plan_modules (plan_id, module_id, included)
select plan_id, 'cells', included from public.plan_modules where module_id = 'groups'
on conflict (plan_id, module_id) do update set included = excluded.included, updated_at = now();

update public.system_modules
set label = 'Células',
    description = 'Células, participantes, encontros, estudos e check-in.',
    route = '/celulas',
    icon_name = 'Network',
    required_permission = 'cells.view'
where id = 'cells';

delete from public.system_modules where id = 'groups';
