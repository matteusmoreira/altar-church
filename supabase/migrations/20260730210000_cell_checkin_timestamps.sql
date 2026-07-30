-- Keep exact check-in moment for member history and cell reports.
alter table public.attendance_records
  add column if not exists checkin_at timestamptz;

update public.attendance_records
set checkin_at = coalesce(checkin_at, created_at)
where event_type = 'cell' and checkin_at is null;

create index if not exists attendance_cell_person_checkin_at_idx
  on public.attendance_records(company_id, person_id, checkin_at desc)
  where event_type = 'cell' and deleted_at is null;
