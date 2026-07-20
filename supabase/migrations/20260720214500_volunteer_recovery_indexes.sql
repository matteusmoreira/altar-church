create index if not exists volunteer_memberships_role_idx
  on public.volunteer_department_memberships(role_id)
  where role_id is not null;

create index if not exists volunteer_template_slots_role_idx
  on public.volunteer_schedule_template_slots(role_id)
  where role_id is not null;

create index if not exists volunteer_event_positions_department_idx
  on public.volunteer_event_positions(department_id);

create index if not exists volunteer_event_positions_role_idx
  on public.volunteer_event_positions(role_id);

create index if not exists volunteer_shifts_event_position_idx
  on public.volunteer_shifts(event_position_id)
  where event_position_id is not null;

create index if not exists volunteer_shifts_role_idx
  on public.volunteer_shifts(role_id)
  where role_id is not null;
