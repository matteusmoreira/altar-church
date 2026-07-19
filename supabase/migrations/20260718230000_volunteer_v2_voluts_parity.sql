-- Voluntariado 2.0: disponibilidade, escala explicável, trocas, chat, cuidado,
-- reconhecimento, push/PWA, culto/louvor e RBAC departamental.

create table if not exists public.volunteer_module_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  v2_enabled boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  require_swap_approval boolean not null default true,
  reminder_hours integer[] not null default array[72, 24, 2],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_department_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete cascade,
  name text not null,
  description text not null default '',
  instructions text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint volunteer_department_roles_name_unique unique (department_id, name)
);

create table if not exists public.volunteer_department_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  access_role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_department_access_role_check check (access_role in ('coordinator', 'leader', 'scheduler')),
  constraint volunteer_department_access_unique unique (department_id, profile_id)
);

alter table public.volunteer_department_memberships
  add column if not exists role_id uuid references public.volunteer_department_roles(id) on delete set null,
  add column if not exists preferred boolean not null default true;

alter table public.volunteer_profiles
  add column if not exists desired_services_per_month integer not null default 2,
  add column if not exists max_services_per_month integer not null default 4,
  add column if not exists minimum_rest_hours integer not null default 12,
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references public.profiles(id) on delete set null;

alter table public.volunteer_profiles drop constraint if exists volunteer_profiles_service_limits_check;
alter table public.volunteer_profiles add constraint volunteer_profiles_service_limits_check
  check (desired_services_per_month between 0 and 31 and max_services_per_month between 1 and 62
    and desired_services_per_month <= max_services_per_month and minimum_rest_hours between 0 and 168);

create table if not exists public.volunteer_availability_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  weekday smallint not null,
  available boolean not null default true,
  starts_at time,
  ends_at time,
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_availability_weekday_check check (weekday between 0 and 6),
  constraint volunteer_availability_time_check check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint volunteer_availability_date_check check (valid_from is null or valid_until is null or valid_from <= valid_until)
);

create table if not exists public.volunteer_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  available boolean not null default false,
  reason text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_availability_exception_window_check check (starts_at < ends_at)
);

create table if not exists public.volunteer_role_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  department_id uuid not null references public.volunteer_departments(id) on delete cascade,
  role_id uuid references public.volunteer_department_roles(id) on delete cascade,
  role_name text not null,
  preference smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_role_preference_range_check check (preference between -2 and 2),
  constraint volunteer_role_preference_unique unique (volunteer_id, department_id, role_name)
);

alter table public.volunteer_shifts
  add column if not exists role_id uuid references public.volunteer_department_roles(id) on delete set null,
  add column if not exists instructions text not null default '';

alter table public.volunteer_assignments
  add column if not exists score integer,
  add column if not exists score_reasons jsonb not null default '[]'::jsonb,
  add column if not exists is_locked boolean not null default false,
  add column if not exists notified_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists decline_reason text,
  add column if not exists checked_out_at timestamptz,
  add column if not exists checkout_source text,
  add column if not exists no_show_marked_at timestamptz;

update public.volunteer_assignments
set status = case when status = 'assigned' then 'notified' else status end
where status = 'assigned';

alter table public.volunteer_assignments drop constraint if exists volunteer_assignments_status_check;
alter table public.volunteer_assignments add constraint volunteer_assignments_status_check
  check (status in ('proposed', 'notified', 'confirmed', 'declined', 'cancelled', 'checked_in', 'checked_out', 'no_show'));
alter table public.volunteer_assignments drop constraint if exists volunteer_assignments_checkout_source_check;
alter table public.volunteer_assignments add constraint volunteer_assignments_checkout_source_check
  check (checkout_source is null or checkout_source in ('button', 'qr', 'manual'));

create table if not exists public.volunteer_swap_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid not null references public.volunteer_assignments(id) on delete cascade,
  requested_by_volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  replacement_volunteer_id uuid references public.volunteer_profiles(id) on delete set null,
  status text not null default 'open',
  reason text not null default '',
  replacement_responded_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_swap_status_check check (status in ('open', 'offered', 'accepted', 'approved', 'rejected', 'cancelled'))
);
create unique index if not exists volunteer_swap_one_open_idx
  on public.volunteer_swap_requests(assignment_id) where status in ('open', 'offered', 'accepted');

create table if not exists public.volunteer_shift_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  status text not null default 'open',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_shift_conversation_unique unique (shift_id),
  constraint volunteer_shift_conversation_status_check check (status in ('open', 'closed'))
);

create table if not exists public.volunteer_shift_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.volunteer_shift_conversations(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint volunteer_shift_message_body_check check (char_length(btrim(body)) between 1 and 4000)
);

create table if not exists public.volunteer_message_files (
  message_id uuid not null references public.volunteer_shift_messages(id) on delete cascade,
  file_id uuid not null references public.app_files(id) on delete cascade,
  primary key (message_id, file_id)
);

create table if not exists public.volunteer_feedbacks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_id uuid not null references public.volunteer_assignments(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  rating smallint not null,
  load_rating smallint not null,
  comment text not null default '',
  request_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_feedback_rating_check check (rating between 1 and 5 and load_rating between 1 and 5),
  constraint volunteer_feedback_assignment_unique unique (assignment_id, volunteer_id)
);

create table if not exists public.volunteer_recognitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  message text not null default '',
  milestone integer,
  is_private boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint volunteer_recognition_kind_check check (kind in ('milestone', 'thanks', 'achievement')),
  constraint volunteer_recognition_private_check check (is_private = true)
);

create table if not exists public.volunteer_notification_preferences (
  volunteer_id uuid primary key references public.volunteer_profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  schedule_enabled boolean not null default true,
  reminder_enabled boolean not null default true,
  swap_enabled boolean not null default true,
  chat_enabled boolean not null default true,
  feed_enabled boolean not null default true,
  recognition_enabled boolean not null default true,
  push_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  email_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  volunteer_id uuid not null references public.volunteer_profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text not null default '',
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_push_endpoint_unique unique (endpoint)
);

create table if not exists public.volunteer_event_setlists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null default 'RepertÃ³rio',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_event_setlist_unique unique (event_id)
);

create table if not exists public.volunteer_event_setlist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  setlist_id uuid not null references public.volunteer_event_setlists(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  title text not null,
  tone text not null default '',
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  spotify_url text not null default '',
  deezer_url text not null default '',
  cifra_club_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteer_event_timeline_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  planned_at timestamptz not null,
  actual_started_at timestamptz,
  duration_minutes integer not null default 5,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  instructions text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_timeline_duration_check check (duration_minutes between 1 and 1440)
);

create table if not exists public.volunteer_shift_files (
  shift_id uuid not null references public.volunteer_shifts(id) on delete cascade,
  file_id uuid not null references public.app_files(id) on delete cascade,
  primary key (shift_id, file_id)
);

alter table public.volunteer_delivery_outbox
  add column if not exists recognition_id uuid references public.volunteer_recognitions(id) on delete cascade,
  add column if not exists event_kind text not null default 'schedule',
  add column if not exists notification_key text,
  add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.volunteer_delivery_outbox drop constraint if exists volunteer_delivery_channel_check;
alter table public.volunteer_delivery_outbox add constraint volunteer_delivery_channel_check
  check (channel in ('whatsapp', 'email', 'push'));
alter table public.volunteer_delivery_outbox drop constraint if exists volunteer_delivery_source_check;
alter table public.volunteer_delivery_outbox add constraint volunteer_delivery_source_check
  check (num_nonnulls(feed_post_id, assignment_id, recognition_id) = 1);
create unique index if not exists volunteer_delivery_notification_key_unique_idx
  on public.volunteer_delivery_outbox(notification_key) where notification_key is not null;

create or replace function public.prepare_volunteer_delivery()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare reminder_count integer := 0;
declare no_show_count integer := 0;
begin
  with due as (
    select assignment.id as assignment_id, assignment.company_id, assignment.volunteer_id,
      person.email, person.phone, coalesce(event.title, 'Escala') as event_title, shift.starts_at, settings.timezone,
      reminder.hour,
      coalesce(preference.reminder_enabled, true) as reminder_enabled,
      coalesce(preference.push_enabled, false) as push_enabled,
      coalesce(preference.whatsapp_enabled, volunteer.whatsapp_enabled) as whatsapp_enabled,
      coalesce(preference.email_enabled, volunteer.email_enabled) as email_enabled
    from public.volunteer_assignments assignment
    join public.volunteer_shifts shift on shift.id = assignment.shift_id
    join public.volunteer_schedules schedule on schedule.id = shift.schedule_id and schedule.status = 'published'
    join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
    join public.people person on person.id = volunteer.person_id
    left join public.events event on event.id = shift.event_id
    left join public.volunteer_notification_preferences preference on preference.volunteer_id = volunteer.id
    join public.volunteer_module_settings settings on settings.company_id = assignment.company_id
    cross join lateral unnest(settings.reminder_hours) as reminder(hour)
    where assignment.status in ('notified', 'confirmed') and shift.starts_at > now()
      and shift.starts_at <= now() + make_interval(hours => reminder.hour)
  ), inserted as (
    insert into public.volunteer_delivery_outbox(company_id, volunteer_id, assignment_id, channel, recipient,
      subject, content, event_kind, notification_key, payload)
    select due.company_id, due.volunteer_id, due.assignment_id, channel.name,
      case channel.name when 'email' then due.email when 'whatsapp' then due.phone else '' end,
      'Lembrete de escala',
      format('Lembrete: %s em %s.', due.event_title, to_char(due.starts_at at time zone due.timezone, 'DD/MM/YYYY HH24:MI')),
      'reminder', format('assignment:%s:reminder:%s:%s', due.assignment_id, due.hour, channel.name),
      jsonb_build_object('url', '/voluntariado', 'assignmentId', due.assignment_id, 'hoursBefore', due.hour)
    from due cross join lateral (values ('push'), ('whatsapp'), ('email')) as channel(name)
    where due.reminder_enabled and ((channel.name = 'push' and due.push_enabled)
      or (channel.name = 'whatsapp' and due.whatsapp_enabled and due.phone <> '')
      or (channel.name = 'email' and due.email_enabled and due.email is not null))
    on conflict (notification_key) where notification_key is not null do nothing returning 1
  ) select count(*) into reminder_count from inserted;

  with marked as (
    update public.volunteer_assignments assignment set status = 'no_show', no_show_marked_at = now(), updated_at = now()
    from public.volunteer_shifts shift
    where assignment.shift_id = shift.id and assignment.status in ('notified', 'confirmed') and shift.checkin_closes_at < now()
    returning 1
  ) select count(*) into no_show_count from marked;
  return jsonb_build_object('reminders', reminder_count, 'noShows', no_show_count);
end;
$$;
revoke all on function public.prepare_volunteer_delivery() from public;
grant execute on function public.prepare_volunteer_delivery() to service_role;

create index if not exists volunteer_roles_department_active_idx on public.volunteer_department_roles(department_id, is_active) where deleted_at is null;
create index if not exists volunteer_department_access_profile_idx on public.volunteer_department_access(profile_id, department_id);
create index if not exists volunteer_availability_rules_lookup_idx on public.volunteer_availability_rules(volunteer_id, weekday);
create index if not exists volunteer_availability_exceptions_lookup_idx on public.volunteer_availability_exceptions(volunteer_id, starts_at, ends_at);
create index if not exists volunteer_assignments_shift_status_idx on public.volunteer_assignments(shift_id, status);
create index if not exists volunteer_assignments_conflict_idx on public.volunteer_assignments(volunteer_id, status, shift_id);
create index if not exists volunteer_shift_messages_conversation_idx on public.volunteer_shift_messages(conversation_id, created_at) where deleted_at is null;
create index if not exists volunteer_feedback_company_idx on public.volunteer_feedbacks(company_id, created_at desc);
create index if not exists volunteer_recognition_volunteer_idx on public.volunteer_recognitions(volunteer_id, granted_at desc);
create index if not exists volunteer_timeline_event_idx on public.volunteer_event_timeline_items(event_id, sort_order);
create index if not exists volunteer_setlist_items_idx on public.volunteer_event_setlist_items(setlist_id, sort_order);

insert into public.volunteer_module_settings(company_id)
select id from public.companies on conflict (company_id) do nothing;

insert into public.volunteer_department_roles(company_id, department_id, name)
select distinct membership.company_id, membership.department_id, membership.role_name
from public.volunteer_department_memberships membership
on conflict (department_id, name) do nothing;

update public.volunteer_department_memberships membership
set role_id = role.id
from public.volunteer_department_roles role
where role.department_id = membership.department_id and role.name = membership.role_name and membership.role_id is null;

insert into public.volunteer_department_access(company_id, department_id, profile_id, access_role)
select department.company_id, department.id, department.manager_profile_id, 'leader'
from public.volunteer_departments department
where department.manager_profile_id is not null
on conflict (department_id, profile_id) do nothing;

create or replace function public.volunteer_current_profile_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profiles where auth_user_id = (select auth.uid()) and active = true limit 1
$$;
create or replace function public.volunteer_current_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select volunteer.id from public.volunteer_profiles volunteer
  join public.profiles profile on profile.person_id = volunteer.person_id
  where profile.auth_user_id = (select auth.uid()) and profile.active and volunteer.deleted_at is null limit 1
$$;
create or replace function public.can_manage_volunteer_company(target_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_superadmin() or exists (
    select 1 from public.profiles profile
    where profile.auth_user_id = (select auth.uid()) and profile.company_id = target_company_id
      and profile.active and profile.role in ('admin', 'pastor')
  )
$$;
create or replace function public.can_manage_volunteer_department(target_department_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.volunteer_departments department
    where department.id = target_department_id and department.deleted_at is null
      and (public.can_manage_volunteer_company(department.company_id)
        or exists (select 1 from public.volunteer_department_access access
          where access.department_id = department.id and access.profile_id = public.volunteer_current_profile_id()))
  )
$$;
create or replace function public.can_view_volunteer(target_volunteer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.volunteer_profiles volunteer
    where volunteer.id = target_volunteer_id and volunteer.deleted_at is null and (
      volunteer.id = public.volunteer_current_id()
      or public.can_manage_volunteer_company(volunteer.company_id)
      or exists (select 1 from public.volunteer_department_memberships membership
        where membership.volunteer_id = volunteer.id and membership.is_active
          and public.can_manage_volunteer_department(membership.department_id))
    )
  )
$$;
create or replace function public.can_access_volunteer_shift(target_shift_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.volunteer_shifts shift
    where shift.id = target_shift_id and (
      public.can_manage_volunteer_department(shift.department_id)
      or exists (select 1 from public.volunteer_assignments assignment
        where assignment.shift_id = shift.id and assignment.volunteer_id = public.volunteer_current_id()
          and assignment.status not in ('declined', 'cancelled')))
  )
$$;

revoke all on function public.volunteer_current_profile_id() from public;
revoke all on function public.volunteer_current_id() from public;
revoke all on function public.can_manage_volunteer_company(uuid) from public;
revoke all on function public.can_manage_volunteer_department(uuid) from public;
revoke all on function public.can_view_volunteer(uuid) from public;
revoke all on function public.can_access_volunteer_shift(uuid) from public;
grant execute on function public.volunteer_current_profile_id(), public.volunteer_current_id() to authenticated;
grant execute on function public.can_manage_volunteer_company(uuid), public.can_manage_volunteer_department(uuid), public.can_access_volunteer_shift(uuid) to authenticated;
grant execute on function public.can_view_volunteer(uuid) to authenticated;

do $$
declare table_name text;
declare all_tables text[] := array[
  'volunteer_module_settings', 'volunteer_department_roles', 'volunteer_department_access',
  'volunteer_availability_rules', 'volunteer_availability_exceptions', 'volunteer_role_preferences',
  'volunteer_swap_requests', 'volunteer_shift_conversations', 'volunteer_shift_messages', 'volunteer_message_files',
  'volunteer_feedbacks', 'volunteer_recognitions', 'volunteer_notification_preferences', 'volunteer_push_subscriptions',
  'volunteer_event_setlists', 'volunteer_event_setlist_items', 'volunteer_event_timeline_items', 'volunteer_shift_files'
];
declare timestamp_tables text[] := array[
  'volunteer_module_settings', 'volunteer_department_roles', 'volunteer_department_access',
  'volunteer_availability_rules', 'volunteer_availability_exceptions', 'volunteer_role_preferences',
  'volunteer_swap_requests', 'volunteer_shift_conversations', 'volunteer_feedbacks',
  'volunteer_push_subscriptions', 'volunteer_event_setlists', 'volunteer_event_setlist_items', 'volunteer_event_timeline_items'
];
begin
  foreach table_name in array all_tables loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('revoke insert, update, delete on public.%I from authenticated', table_name);
  end loop;
  foreach table_name in array timestamp_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
  end loop;
end $$;

-- Close the original broad write surface. Mutations go through authenticated Server Actions/API.
do $$
declare table_name text;
declare legacy_tables text[] := array[
  'volunteer_profiles', 'volunteer_departments', 'volunteer_department_memberships',
  'volunteer_schedule_templates', 'volunteer_schedule_template_slots', 'volunteer_schedules',
  'volunteer_shifts', 'volunteer_assignments', 'volunteer_checkin_qr_sessions',
  'volunteer_feed_posts', 'volunteer_feed_post_departments', 'volunteer_feed_reads',
  'volunteer_delivery_outbox', 'volunteer_delivery_webhook_events'
];
begin
  foreach table_name in array legacy_tables loop
    execute format('revoke insert, update, delete on public.%I from authenticated', table_name);
  end loop;
end $$;

-- Replace broad policies on company-owned legacy tables with read-only audience policies.
do $$
declare table_name text;
declare company_tables text[] := array[
  'volunteer_profiles', 'volunteer_departments', 'volunteer_department_memberships',
  'volunteer_schedule_templates', 'volunteer_schedule_template_slots', 'volunteer_schedules',
  'volunteer_shifts', 'volunteer_assignments', 'volunteer_checkin_qr_sessions',
  'volunteer_feed_posts', 'volunteer_delivery_outbox'
];
begin
  foreach table_name in array company_tables loop
    execute format('drop policy if exists %I on public.%I', table_name || ' company access', table_name);
  end loop;
end $$;

create policy "volunteer departments scoped read" on public.volunteer_departments for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer profiles scoped read" on public.volunteer_profiles for select to authenticated
using (public.can_view_volunteer(id));
create policy "volunteer memberships scoped read" on public.volunteer_department_memberships for select to authenticated
using (public.can_manage_volunteer_department(department_id) or volunteer_id = public.volunteer_current_id());
create policy "volunteer roles scoped read" on public.volunteer_department_roles for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer access scoped read" on public.volunteer_department_access for select to authenticated
using (public.can_manage_volunteer_company(company_id) or profile_id = public.volunteer_current_profile_id());
create policy "volunteer templates scoped read" on public.volunteer_schedule_templates for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer template slots scoped read" on public.volunteer_schedule_template_slots for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer schedules scoped read" on public.volunteer_schedules for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer shifts scoped read" on public.volunteer_shifts for select to authenticated
using (public.can_manage_volunteer_department(department_id) or public.can_access_volunteer_shift(id));
create policy "volunteer assignments scoped read" on public.volunteer_assignments for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_access_volunteer_shift(shift_id));
create policy "volunteer availability rules scoped read" on public.volunteer_availability_rules for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_manage_volunteer_company(company_id));
create policy "volunteer availability exceptions scoped read" on public.volunteer_availability_exceptions for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_manage_volunteer_company(company_id));
create policy "volunteer role preferences scoped read" on public.volunteer_role_preferences for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_manage_volunteer_company(company_id));
create policy "volunteer swaps scoped read" on public.volunteer_swap_requests for select to authenticated
using (requested_by_volunteer_id = public.volunteer_current_id() or replacement_volunteer_id = public.volunteer_current_id()
  or public.can_manage_volunteer_company(company_id));
create policy "volunteer conversations scoped read" on public.volunteer_shift_conversations for select to authenticated
using (public.can_access_volunteer_shift(shift_id));
create policy "volunteer messages scoped read" on public.volunteer_shift_messages for select to authenticated
using (exists (select 1 from public.volunteer_shift_conversations conversation
  where conversation.id = conversation_id and public.can_access_volunteer_shift(conversation.shift_id)));
create policy "volunteer feedback scoped read" on public.volunteer_feedbacks for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_manage_volunteer_company(company_id));
create policy "volunteer recognition private read" on public.volunteer_recognitions for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_manage_volunteer_company(company_id));
create policy "volunteer preferences private read" on public.volunteer_notification_preferences for select to authenticated
using (volunteer_id = public.volunteer_current_id());
create policy "volunteer push private read" on public.volunteer_push_subscriptions for select to authenticated
using (volunteer_id = public.volunteer_current_id());
create policy "volunteer setlists scoped read" on public.volunteer_event_setlists for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer setlist items scoped read" on public.volunteer_event_setlist_items for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer timeline scoped read" on public.volunteer_event_timeline_items for select to authenticated
using (public.is_company_member(company_id));
create policy "volunteer settings scoped read" on public.volunteer_module_settings for select to authenticated
using (public.is_company_member(company_id));

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'volunteer_shift_messages') then
    alter publication supabase_realtime add table public.volunteer_shift_messages;
  end if;
end $$;
