-- Ajuste pós-auditoria: remove redundância e cobre FKs das entregas recentes.

drop index if exists public.cell_health_settings_group_idx;
create index if not exists cell_health_settings_group_fk_idx
  on public.cell_health_settings(group_id);
create index if not exists cell_health_settings_created_by_idx
  on public.cell_health_settings(created_by);
create index if not exists cell_health_settings_updated_by_idx
  on public.cell_health_settings(updated_by);

create index if not exists member_event_rsvps_event_fk_idx
  on public.member_event_rsvps(event_id);
create index if not exists member_event_rsvps_person_fk_idx
  on public.member_event_rsvps(person_id);

create index if not exists person_follow_up_tasks_crm_card_fk_idx
  on public.person_follow_up_tasks(crm_card_id);
create index if not exists person_follow_up_tasks_created_by_idx
  on public.person_follow_up_tasks(created_by);
create index if not exists person_follow_up_tasks_updated_by_idx
  on public.person_follow_up_tasks(updated_by);
create index if not exists person_follow_up_triggers_created_by_idx
  on public.person_follow_up_triggers(created_by);
create index if not exists person_follow_up_triggers_updated_by_idx
  on public.person_follow_up_triggers(updated_by);

create index if not exists public_acquisition_form_fk_idx
  on public.public_acquisition_events(form_id);
create index if not exists public_acquisition_submission_fk_idx
  on public.public_acquisition_events(form_submission_id);
create index if not exists public_acquisition_event_fk_idx
  on public.public_acquisition_events(event_id);
create index if not exists public_acquisition_person_fk_idx
  on public.public_acquisition_events(person_id);
create index if not exists public_acquisition_crm_card_fk_idx
  on public.public_acquisition_events(crm_card_id);
