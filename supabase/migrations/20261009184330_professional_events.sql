begin;
alter table public.events
  add column value_cents integer not null default 0 check (value_cents >= 0),
  add column value_instructions text not null default '',
  add column allow_walk_ins boolean not null default true,
  add column cover_file_id uuid references public.app_files(id);
create index events_company_starts_id_idx on public.events(company_id, starts_at desc, id) where deleted_at is null;
insert into public.event_attendee_tokens(company_id, event_id, member_rsvp_id)
select company_id, event_id, id from public.member_event_rsvps where status = 'going' on conflict do nothing;
insert into public.event_attendee_tokens(company_id, event_id, guest_registration_id)
select company_id, event_id, id from public.event_guest_registrations where status = 'going' on conflict do nothing;
commit;
