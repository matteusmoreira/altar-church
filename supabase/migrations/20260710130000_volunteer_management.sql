-- Volunteer management: authenticated portal, monthly schedules, feed and delivery outbox.

alter table public.profiles
  add column if not exists person_id uuid references public.people(id) on delete set null;

create unique index if not exists profiles_person_id_unique_idx
  on public.profiles(person_id)
  where person_id is not null;

create table if not exists public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  registration_status text not null default 'pending',
  whatsapp_enabled boolean not null default false,
  email_enabled boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint volunteer_profiles_status_check check (registration_status in ('pending', 'active', 'inactive', 'suspended')),
  constraint volunteer_profiles_person_unique unique (person_id)
);

create table if not exists public.volunteer_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid references public.ministries(id) on delete set null,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint volunteer_departments_company_name_unique unique (company_id, name)
);

create table if not exists public.volunteer_department_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  role_name text not null default 'Voluntário',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_department_memberships_unique unique (department_id, volunteer_id, role_name)
);

create table if not exists public.volunteer_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint volunteer_schedule_templates_company_name_unique unique (company_id, name)
);

create table if not exists public.volunteer_schedule_template_slots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.volunteer_schedule_templates(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete restrict,
  role_name text not null,
  required_volunteers integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_template_slots_required_check check (required_volunteers > 0),
  constraint volunteer_template_slots_unique unique (template_id, department_id, role_name)
);

alter table public.events
  add column if not exists volunteer_template_id uuid references public.volunteer_schedule_templates(id) on delete set null;

create table if not exists public.volunteer_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  month date not null,
  status text not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_schedules_status_check check (status in ('draft', 'published', 'archived')),
  constraint volunteer_schedules_month_start_check check (month = date_trunc('month', month)::date),
  constraint volunteer_schedules_company_month_unique unique (company_id, month)
);

create table if not exists public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  schedule_id uuid not null references public.volunteer_schedules(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  template_slot_id uuid references public.volunteer_schedule_template_slots(id) on delete set null,
  department_id uuid not null references public.volunteer_departments(id) on delete restrict,
  role_name text not null,
  required_volunteers integer not null default 1,
  starts_at timestamptz not null,
  ends_at timestamptz,
  checkin_opens_at timestamptz not null,
  checkin_closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_shifts_required_check check (required_volunteers > 0),
  constraint volunteer_shifts_checkin_window_check check (checkin_opens_at < checkin_closes_at),
  constraint volunteer_shifts_slot_once_unique unique (schedule_id, event_id, template_slot_id)
);

create table if not exists public.volunteer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  status text not null default 'assigned',
  checked_in_at timestamptz,
  checkin_source text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_assignments_status_check check (status in ('assigned', 'confirmed', 'declined', 'cancelled', 'checked_in')),
  constraint volunteer_assignments_source_check check (checkin_source is null or checkin_source in ('button', 'qr')),
  constraint volunteer_assignments_shift_volunteer_unique unique (shift_id, volunteer_id)
);

create table if not exists public.volunteer_checkin_qr_sessions (
  token uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.volunteer_feed_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default 'draft',
  audience text not null default 'all',
  published_at timestamptz,
  author_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_feed_posts_status_check check (status in ('draft', 'published', 'archived')),
  constraint volunteer_feed_posts_audience_check check (audience in ('all', 'departments'))
);

create table if not exists public.volunteer_feed_post_departments (
  post_id uuid not null references public.volunteer_feed_posts(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete cascade,
  primary key (post_id, department_id)
);

create table if not exists public.volunteer_feed_reads (
  post_id uuid not null references public.volunteer_feed_posts(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (post_id, volunteer_id)
);

create table if not exists public.volunteer_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  feed_post_id uuid references public.volunteer_feed_posts(id) on delete cascade,
  assignment_id uuid references public.volunteer_assignments(id) on delete cascade,
  channel text not null,
  recipient text not null default '',
  subject text not null default '',
  content text not null,
  status text not null default 'pending',
  provider_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_delivery_channel_check check (channel in ('whatsapp', 'email')),
  constraint volunteer_delivery_status_check check (status in ('pending', 'processing', 'queued', 'sent', 'delivered', 'failed', 'skipped')),
  constraint volunteer_delivery_source_check check (num_nonnulls(feed_post_id, assignment_id) = 1)
);

create table if not exists public.volunteer_delivery_webhook_events (
  provider text not null,
  provider_event_id text not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  primary key (provider, provider_event_id)
);

create or replace function public.claim_volunteer_delivery_batch(batch_size integer default 25)
returns setof public.volunteer_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select id
    from public.volunteer_delivery_outbox
    where status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempts < 8
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.volunteer_delivery_outbox delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_volunteer_delivery_batch(integer) from public;
grant execute on function public.claim_volunteer_delivery_batch(integer) to service_role;

create index if not exists volunteer_profiles_company_status_idx on public.volunteer_profiles(company_id, registration_status) where deleted_at is null;
create index if not exists volunteer_memberships_department_idx on public.volunteer_department_memberships(company_id, department_id) where is_active;
create index if not exists volunteer_shifts_schedule_starts_idx on public.volunteer_shifts(company_id, schedule_id, starts_at);
create index if not exists volunteer_assignments_volunteer_idx on public.volunteer_assignments(company_id, volunteer_id, status);
create index if not exists volunteer_feed_posts_published_idx on public.volunteer_feed_posts(company_id, status, published_at desc);
create index if not exists volunteer_delivery_outbox_work_idx on public.volunteer_delivery_outbox(status, next_attempt_at) where status in ('pending', 'failed');
create unique index if not exists volunteer_delivery_feed_unique_idx on public.volunteer_delivery_outbox(feed_post_id, volunteer_id, channel) where feed_post_id is not null;
create unique index if not exists volunteer_delivery_assignment_unique_idx on public.volunteer_delivery_outbox(assignment_id, volunteer_id, channel) where assignment_id is not null;

do $$
declare
  table_name text;
  managed_tables text[] := array[
    'volunteer_profiles', 'volunteer_departments', 'volunteer_department_memberships',
    'volunteer_schedule_templates', 'volunteer_schedule_template_slots', 'volunteer_schedules',
    'volunteer_shifts', 'volunteer_assignments', 'volunteer_checkin_qr_sessions',
    'volunteer_feed_posts', 'volunteer_feed_post_departments', 'volunteer_feed_reads',
    'volunteer_delivery_outbox', 'volunteer_delivery_webhook_events'
  ];
begin
  foreach table_name in array managed_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    if table_name not in ('volunteer_checkin_qr_sessions', 'volunteer_feed_reads', 'volunteer_delivery_webhook_events') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    end if;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' company access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || ' company access', table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

insert into public.volunteer_profiles (company_id, person_id, registration_status, created_at, updated_at)
select p.company_id,
       p.id,
       case when p.is_active and p.status = 'active' then 'active' else 'inactive' end,
       now(),
       now()
from public.people p
where p.person_type = 'volunteer'
  and p.deleted_at is null
on conflict (person_id) do nothing;

update public.profiles profile
set person_id = matches.person_id,
    updated_at = now()
from (
  select profile_row.id as profile_id, min(person.id) as person_id
  from public.profiles profile_row
  join public.people person
    on person.company_id = profile_row.company_id
   and person.deleted_at is null
   and person.email is not null
   and lower(person.email) = lower(profile_row.email)
  group by profile_row.id
  having count(*) = 1
) matches
where profile.id = matches.profile_id
  and profile.person_id is null;

insert into public.system_modules (id, label, description, route, menu_group, icon_name, required_permission, sort_order)
values ('volunteers', 'Voluntariado', 'Gestão de voluntários, escalas e check-in.', '/voluntariado', 'Cuidar', 'Handshake', 'volunteers.view', 85)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    route = excluded.route,
    menu_group = excluded.menu_group,
    icon_name = excluded.icon_name,
    required_permission = excluded.required_permission,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

insert into public.plan_modules (plan_id, module_id, included)
select plan.id, 'volunteers', true
from public.system_plans plan
on conflict (plan_id, module_id) do update set included = true, updated_at = now();

insert into public.company_modules (company_id, module_id, enabled)
select company.id, 'volunteers', true
from public.companies company
on conflict (company_id, module_id) do nothing;
