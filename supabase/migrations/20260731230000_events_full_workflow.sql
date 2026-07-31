-- Eventos: participação pública, check-in, recursos e comunicação operacional.

alter table public.events
  add column if not exists public_token uuid;

update public.events
set public_token = gen_random_uuid()
where public_token is null;

alter table public.events
  alter column public_token set default gen_random_uuid(),
  alter column public_token set not null;

create unique index if not exists events_public_token_unique
  on public.events(public_token)
  where deleted_at is null;

create table if not exists public.event_guest_registrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  confirmation_token uuid not null default gen_random_uuid(),
  full_name text not null,
  email text not null default '',
  phone text not null default '',
  consent_at timestamptz not null,
  status text not null default 'going',
  checked_in_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_guest_registration_status_check check (status in ('going', 'waitlisted', 'canceled')),
  constraint event_guest_registration_name_check check (length(btrim(full_name)) >= 2),
  constraint event_guest_registration_token_unique unique (confirmation_token)
);

create index if not exists event_guest_registrations_event_status_idx
  on public.event_guest_registrations(company_id, event_id, status, created_at);
create index if not exists event_guest_registrations_contact_idx
  on public.event_guest_registrations(company_id, event_id, lower(email), phone)
  where status <> 'canceled';

create table if not exists public.event_checkin_sessions (
  token uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  opens_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_checkin_session_window_check check (opens_at < expires_at)
);

create index if not exists event_checkin_sessions_event_idx
  on public.event_checkin_sessions(company_id, event_id, expires_at desc);

create table if not exists public.event_attendee_tokens (
  token uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  member_rsvp_id uuid references public.member_event_rsvps(id) on delete cascade,
  guest_registration_id uuid references public.event_guest_registrations(id) on delete cascade,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint event_attendee_token_owner_check check (num_nonnulls(member_rsvp_id, guest_registration_id) = 1)
);

create unique index if not exists event_attendee_tokens_member_unique
  on public.event_attendee_tokens(member_rsvp_id)
  where member_rsvp_id is not null;
create unique index if not exists event_attendee_tokens_guest_unique
  on public.event_attendee_tokens(guest_registration_id)
  where guest_registration_id is not null;
create index if not exists event_attendee_tokens_event_idx
  on public.event_attendee_tokens(company_id, event_id);

alter table public.attendance_records
  add column if not exists guest_registration_id uuid references public.event_guest_registrations(id) on delete set null,
  add column if not exists event_checkin_session_token uuid references public.event_checkin_sessions(token) on delete set null;

create unique index if not exists attendance_records_event_guest_unique
  on public.attendance_records(company_id, event_ref_id, guest_registration_id)
  where event_type = 'event' and guest_registration_id is not null and deleted_at is null;
create unique index if not exists attendance_records_event_person_unique
  on public.attendance_records(company_id, event_ref_id, person_id)
  where event_type = 'event' and person_id is not null and deleted_at is null;
create index if not exists attendance_records_event_checkin_session_idx
  on public.attendance_records(event_checkin_session_token)
  where event_checkin_session_token is not null and deleted_at is null;
create index if not exists attendance_records_event_ref_status_idx
  on public.attendance_records(company_id, event_ref_id, event_type, status)
  where deleted_at is null;

create table if not exists public.event_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  notes text not null default '',
  file_id uuid references public.app_files(id) on delete set null,
  external_url text,
  visibility text not null default 'private',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint event_resources_visibility_check check (visibility in ('private', 'public')),
  constraint event_resources_source_check check (file_id is not null or nullif(btrim(external_url), '') is not null or length(btrim(notes)) > 0)
);

create index if not exists event_resources_event_idx
  on public.event_resources(company_id, event_id, created_at desc)
  where deleted_at is null;

alter table public.notifications
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists event_template_key text;

alter table public.notifications drop constraint if exists notifications_audience_kind_check;
alter table public.notifications
  add constraint notifications_audience_kind_check
  check (audience_kind in (
    'all', 'cell', 'ministry', 'ministry_team', 'visitors', 'birthdays', 'manual',
    'event_going', 'event_waitlist', 'event_guests', 'event_volunteers', 'event_all'
  ));

create unique index if not exists notifications_event_template_unique
  on public.notifications(company_id, event_id, event_template_key)
  where event_id is not null and event_template_key is not null and deleted_at is null;
create index if not exists notifications_event_idx
  on public.notifications(company_id, event_id, scheduled_at)
  where event_id is not null and deleted_at is null;

alter table public.notification_deliveries
  alter column person_id drop not null,
  add column if not exists guest_registration_id uuid references public.event_guest_registrations(id) on delete cascade;

alter table public.notification_deliveries drop constraint if exists notification_delivery_recipient_check;
alter table public.notification_deliveries
  add constraint notification_delivery_recipient_check
  check (person_id is not null or guest_registration_id is not null);

create index if not exists notification_deliveries_guest_idx
  on public.notification_deliveries(company_id, guest_registration_id, created_at desc)
  where guest_registration_id is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'event_guest_registrations', 'event_checkin_sessions', 'event_attendee_tokens', 'event_resources'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_company_access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || '_company_access', table_name
    );
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    if table_name in ('event_guest_registrations', 'event_resources') then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        table_name || '_set_updated_at', table_name
      );
    end if;
  end loop;
end;
$$;

grant select, insert, update on public.event_guest_registrations to authenticated;
grant select, insert, update on public.event_checkin_sessions to authenticated;
grant select, insert, update on public.event_attendee_tokens to authenticated;
grant select, insert, update, delete on public.event_resources to authenticated;

analyze public.events;
analyze public.event_guest_registrations;
analyze public.event_checkin_sessions;
analyze public.event_attendee_tokens;
analyze public.attendance_records;
analyze public.event_resources;
analyze public.notifications;
analyze public.notification_deliveries;
