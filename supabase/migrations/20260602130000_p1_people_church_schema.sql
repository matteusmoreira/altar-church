create table if not exists public.congregations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  responsible text not null default '',
  address text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  full_name text not null,
  email text,
  phone text not null default '',
  document text,
  birth_date date,
  gender text,
  photo_file_id uuid references public.app_files(id) on delete set null,
  address text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Brasil',
  access_profile text,
  status text not null default 'active',
  person_type text not null default 'member',
  journey_status text not null default '',
  baptized boolean not null default false,
  email_validated boolean not null default false,
  internal_notes text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint people_status_check check (status in ('active', 'inactive', 'visitor')),
  constraint people_person_type_check check (person_type in ('visitor', 'attendee', 'member', 'leader', 'volunteer')),
  constraint people_gender_check check (gender is null or gender in ('male', 'female', 'other', 'not_informed')),
  constraint people_full_name_check check (length(trim(full_name)) >= 2)
);

create table if not exists public.church_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  public_name text not null default '',
  responsible_name text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  country text not null default 'Brasil',
  timezone text not null default 'America/Sao_Paulo',
  history text not null default '',
  logo_file_id uuid references public.app_files(id) on delete set null,
  cover_file_id uuid references public.app_files(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint church_profiles_company_unique unique (company_id)
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  church_profile_id uuid references public.church_profiles(id) on delete cascade,
  platform text not null,
  url text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.person_custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  show_on_public_form boolean not null default false,
  available_in_app boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint person_custom_fields_type_check check (field_type in ('text', 'date', 'single', 'multiple'))
);

create table if not exists public.person_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  field_id uuid not null references public.person_custom_fields(id) on delete cascade,
  value_text text,
  value_date date,
  value_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_custom_field_values_unique unique (person_id, field_id)
);

create table if not exists public.person_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  category text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint person_activities_category_check check (category in ('pastoral', 'worship', 'ministry', 'small_group', 'volunteer'))
);

create table if not exists public.person_activity_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  activity_id uuid not null references public.person_activities(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_activity_assignments_unique unique (person_id, activity_id)
);

create table if not exists public.member_journeys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.member_journey_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  journey_id uuid not null references public.member_journeys(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.person_journey_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  journey_id uuid not null references public.member_journeys(id) on delete cascade,
  step_id uuid references public.member_journey_steps(id) on delete set null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_journey_progress_unique unique (person_id, journey_id, step_id)
);

create table if not exists public.duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_person_id uuid not null references public.people(id) on delete cascade,
  duplicate_person_id uuid not null references public.people(id) on delete cascade,
  reason text not null,
  similarity_score numeric(5, 2) not null default 0,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duplicate_candidates_status_check check (status in ('open', 'ignored', 'merged')),
  constraint duplicate_candidates_score_check check (similarity_score >= 0 and similarity_score <= 100),
  constraint duplicate_candidates_pair_check check (primary_person_id <> duplicate_person_id),
  constraint duplicate_candidates_pair_unique unique (primary_person_id, duplicate_person_id)
);

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  contact text not null default '',
  leader_person_id uuid references public.people(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.programmings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz,
  duration_minutes integer not null default 60,
  is_recurring boolean not null default false,
  recurrence_rule text not null default '',
  is_live boolean not null default false,
  allow_public_chat boolean not null default false,
  send_push_notification boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint programmings_duration_check check (duration_minutes > 0)
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  subtitle text not null default '',
  code text not null default '',
  author text not null default '',
  theme text not null default '',
  song_group text not null default '',
  tone text not null default '',
  rhythm text not null default '',
  content text not null default '',
  file_id uuid references public.app_files(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.people_import_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null,
  status text not null default 'queued',
  file_id uuid references public.app_files(id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_import_exports_kind_check check (kind in ('import', 'export')),
  constraint people_import_exports_status_check check (status in ('queued', 'processing', 'completed', 'failed')),
  constraint people_import_exports_row_count_check check (row_count >= 0)
);

create table if not exists public.public_registration_rate_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ip_hash text not null,
  email text,
  phone text,
  window_start timestamptz not null default date_trunc('hour', now()),
  submission_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_registration_rate_limits_count_check check (submission_count > 0),
  constraint public_registration_rate_limits_unique unique (company_id, ip_hash, window_start)
);

create index if not exists congregations_company_id_created_at_idx
on public.congregations(company_id, created_at desc);

create index if not exists congregations_company_id_active_idx
on public.congregations(company_id, is_active)
where deleted_at is null;

create index if not exists people_company_id_created_at_idx
on public.people(company_id, created_at desc);

create index if not exists people_company_id_search_idx
on public.people(company_id, lower(full_name), lower(coalesce(phone, '')))
where deleted_at is null;

create index if not exists people_company_id_email_idx
on public.people(company_id, lower(email))
where email is not null and deleted_at is null;

create index if not exists people_company_id_document_idx
on public.people(company_id, document)
where document is not null and deleted_at is null;

create index if not exists people_company_id_status_idx
on public.people(company_id, status, is_active)
where deleted_at is null;

create index if not exists church_profiles_company_id_idx
on public.church_profiles(company_id);

create index if not exists social_links_company_id_sort_idx
on public.social_links(company_id, sort_order)
where deleted_at is null;

create index if not exists person_custom_fields_company_id_sort_idx
on public.person_custom_fields(company_id, sort_order)
where deleted_at is null;

create index if not exists person_custom_field_values_person_id_idx
on public.person_custom_field_values(person_id);

create index if not exists person_custom_field_values_field_id_idx
on public.person_custom_field_values(field_id);

create index if not exists person_activities_company_id_active_idx
on public.person_activities(company_id, is_active)
where deleted_at is null;

create index if not exists person_activity_assignments_person_id_idx
on public.person_activity_assignments(person_id);

create index if not exists person_activity_assignments_activity_id_idx
on public.person_activity_assignments(activity_id);

create index if not exists member_journeys_company_id_sort_idx
on public.member_journeys(company_id, sort_order)
where deleted_at is null;

create index if not exists member_journey_steps_journey_id_sort_idx
on public.member_journey_steps(journey_id, sort_order)
where deleted_at is null;

create index if not exists person_journey_progress_person_id_idx
on public.person_journey_progress(person_id);

create index if not exists duplicate_candidates_company_id_status_idx
on public.duplicate_candidates(company_id, status, detected_at desc);

create index if not exists duplicate_candidates_primary_person_id_idx
on public.duplicate_candidates(primary_person_id);

create index if not exists ministries_company_id_active_idx
on public.ministries(company_id, is_active)
where deleted_at is null;

create index if not exists programmings_company_id_starts_at_idx
on public.programmings(company_id, starts_at desc)
where deleted_at is null;

create index if not exists songs_company_id_title_idx
on public.songs(company_id, lower(title))
where deleted_at is null;

create index if not exists people_import_exports_company_id_created_at_idx
on public.people_import_exports(company_id, created_at desc);

create index if not exists public_registration_rate_limits_company_id_window_idx
on public.public_registration_rate_limits(company_id, window_start desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'congregations',
    'people',
    'church_profiles',
    'social_links',
    'person_custom_fields',
    'person_custom_field_values',
    'person_activities',
    'person_activity_assignments',
    'member_journeys',
    'member_journey_steps',
    'person_journey_progress',
    'duplicate_candidates',
    'ministries',
    'programmings',
    'songs',
    'people_import_exports',
    'public_registration_rate_limits'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

alter table public.people enable row level security;
alter table public.person_custom_fields enable row level security;
alter table public.person_custom_field_values enable row level security;
alter table public.person_activities enable row level security;
alter table public.person_activity_assignments enable row level security;
alter table public.member_journeys enable row level security;
alter table public.member_journey_steps enable row level security;
alter table public.person_journey_progress enable row level security;
alter table public.duplicate_candidates enable row level security;
alter table public.church_profiles enable row level security;
alter table public.ministries enable row level security;
alter table public.programmings enable row level security;
alter table public.songs enable row level security;
alter table public.congregations enable row level security;
alter table public.social_links enable row level security;
alter table public.people_import_exports enable row level security;
alter table public.public_registration_rate_limits enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'people',
    'person_custom_fields',
    'person_custom_field_values',
    'person_activities',
    'person_activity_assignments',
    'member_journeys',
    'member_journey_steps',
    'person_journey_progress',
    'duplicate_candidates',
    'church_profiles',
    'ministries',
    'programmings',
    'songs',
    'congregations',
    'social_links',
    'people_import_exports',
    'public_registration_rate_limits'
  ]
  loop
    execute format('drop policy if exists "Company members read rows" on public.%I', table_name);
    execute format(
      'create policy "Company members read rows" on public.%I for select to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name
    );

    execute format('drop policy if exists "Company members insert rows" on public.%I', table_name);
    execute format(
      'create policy "Company members insert rows" on public.%I for insert to authenticated with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name
    );

    execute format('drop policy if exists "Company members update rows" on public.%I', table_name);
    execute format(
      'create policy "Company members update rows" on public.%I for update to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name
    );

    execute format('drop policy if exists "Company members delete rows" on public.%I', table_name);
    execute format(
      'create policy "Company members delete rows" on public.%I for delete to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on
  public.people,
  public.person_custom_fields,
  public.person_custom_field_values,
  public.person_activities,
  public.person_activity_assignments,
  public.member_journeys,
  public.member_journey_steps,
  public.person_journey_progress,
  public.duplicate_candidates,
  public.church_profiles,
  public.ministries,
  public.programmings,
  public.songs,
  public.congregations,
  public.social_links,
  public.people_import_exports,
  public.public_registration_rate_limits
to authenticated;

insert into public.church_profiles (
  company_id,
  public_name,
  responsible_name,
  email,
  phone,
  address,
  city,
  state
)
select
  c.id,
  c.name,
  c.responsible_name,
  c.email,
  c.phone,
  c.address,
  c.city,
  c.state
from public.companies c
on conflict (company_id) do nothing;
