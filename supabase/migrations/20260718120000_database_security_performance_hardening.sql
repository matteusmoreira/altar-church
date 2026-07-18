-- Targeted hardening based on the live 2026-07-18 database audit.
-- Avoid blanket indexing: only high-growth relations and worker/security paths.

-- Prevent auth.uid() from being re-evaluated for every candidate row.
drop policy if exists "Cell notices inserted by leadership" on public.cell_notices;
create policy "Cell notices inserted by leadership"
on public.cell_notices
for insert
to authenticated
with check (
  (select public.is_superadmin())
  or exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.company_id = cell_notices.company_id
      and profile.role in ('admin', 'cell_supervisor', 'cell_leader')
  )
);

-- Worker/trigger functions must not be callable through the public REST API.
revoke execute on function public.claim_integration_delivery_batch(integer) from anon, authenticated;
revoke execute on function public.claim_kid_delivery_batch(integer) from anon, authenticated;
revoke execute on function public.claim_volunteer_delivery_batch(integer) from anon, authenticated;
revoke execute on function public.process_integration_deliveries(integer) from anon, authenticated;
revoke execute on function public.link_profile_to_auth_user() from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;

grant execute on function public.claim_integration_delivery_batch(integer) to service_role, postgres;
grant execute on function public.claim_kid_delivery_batch(integer) to service_role, postgres;
grant execute on function public.claim_volunteer_delivery_batch(integer) to service_role, postgres;
grant execute on function public.process_integration_deliveries(integer) to service_role, postgres;
grant execute on function public.link_profile_to_auth_user() to supabase_auth_admin, postgres;
grant execute on function public.rls_auto_enable() to postgres;

-- RLS helpers are intentional for authenticated users, never anonymous users.
revoke execute on function public.can_access_cell_meeting(uuid) from anon;
revoke execute on function public.can_access_cell_study(uuid) from anon;
revoke execute on function public.can_manage_cell(uuid) from anon;
revoke execute on function public.cell_current_person_id() from anon;
revoke execute on function public.cell_current_profile_id() from anon;
revoke execute on function public.is_cell_participant(uuid) from anon;
revoke execute on function public.is_company_member(uuid) from anon;
revoke execute on function public.is_superadmin() from anon;
revoke execute on function public.kids_current_profile_id() from anon;
revoke execute on function public.kids_guardian_kid_ids() from anon;
revoke execute on function public.kids_is_guardian() from anon;
revoke execute on function public.kids_is_staff() from anon;

-- Foreign-key support on relations expected to accumulate operational history.
create index if not exists attendance_records_checkin_session_idx
  on public.attendance_records(checkin_session_id)
  where checkin_session_id is not null and deleted_at is null;

create index if not exists audit_logs_actor_auth_user_idx
  on public.audit_logs(actor_auth_user_id)
  where actor_auth_user_id is not null;

create index if not exists crm_cards_person_idx
  on public.crm_cards(person_id)
  where person_id is not null and deleted_at is null;

create index if not exists form_submissions_crm_card_idx
  on public.form_submissions(crm_card_id)
  where crm_card_id is not null;

create index if not exists form_submissions_person_idx
  on public.form_submissions(person_id)
  where person_id is not null;

create index if not exists kid_access_events_attendance_idx
  on public.kid_access_events(attendance_id)
  where attendance_id is not null;

create index if not exists kid_incidents_session_idx
  on public.kid_incidents(session_id)
  where session_id is not null and deleted_at is null;

create index if not exists kid_incidents_session_classroom_idx
  on public.kid_incidents(session_classroom_id)
  where session_classroom_id is not null and deleted_at is null;

create index if not exists kid_messages_session_idx
  on public.kid_messages(session_id)
  where session_id is not null and deleted_at is null;

create index if not exists kid_messages_kid_idx
  on public.kid_messages(kid_id)
  where kid_id is not null and deleted_at is null;

create index if not exists kid_lesson_reports_session_classroom_idx
  on public.kid_lesson_reports(session_classroom_id)
  where session_classroom_id is not null and deleted_at is null;

create index if not exists volunteer_shifts_department_idx
  on public.volunteer_shifts(department_id);

create index if not exists volunteer_shifts_event_idx
  on public.volunteer_shifts(event_id)
  where event_id is not null;
