-- Índices de FK do fluxo completo de Eventos.
create index if not exists event_guest_registrations_event_fk_idx
  on public.event_guest_registrations(event_id);
create index if not exists event_guest_registrations_person_fk_idx
  on public.event_guest_registrations(person_id)
  where person_id is not null;

create index if not exists event_checkin_sessions_event_fk_idx
  on public.event_checkin_sessions(event_id);
create index if not exists event_checkin_sessions_created_by_fk_idx
  on public.event_checkin_sessions(created_by)
  where created_by is not null;

create index if not exists event_attendee_tokens_event_fk_idx
  on public.event_attendee_tokens(event_id);
create index if not exists event_attendee_tokens_member_fk_idx
  on public.event_attendee_tokens(member_rsvp_id)
  where member_rsvp_id is not null;
create index if not exists event_attendee_tokens_guest_fk_idx
  on public.event_attendee_tokens(guest_registration_id)
  where guest_registration_id is not null;
create index if not exists event_attendee_tokens_created_by_fk_idx
  on public.event_attendee_tokens(created_by)
  where created_by is not null;

create index if not exists attendance_records_guest_fk_idx
  on public.attendance_records(guest_registration_id)
  where guest_registration_id is not null;

create index if not exists event_resources_event_fk_idx
  on public.event_resources(event_id);
create index if not exists event_resources_file_fk_idx
  on public.event_resources(file_id)
  where file_id is not null;
create index if not exists event_resources_created_by_fk_idx
  on public.event_resources(created_by)
  where created_by is not null;
create index if not exists event_resources_updated_by_fk_idx
  on public.event_resources(updated_by)
  where updated_by is not null;

create index if not exists notifications_event_fk_idx
  on public.notifications(event_id)
  where event_id is not null;

create index if not exists notification_deliveries_guest_fk_idx
  on public.notification_deliveries(guest_registration_id)
  where guest_registration_id is not null;

analyze public.event_guest_registrations;
analyze public.event_checkin_sessions;
analyze public.event_attendee_tokens;
analyze public.attendance_records;
analyze public.event_resources;
analyze public.notifications;
analyze public.notification_deliveries;
