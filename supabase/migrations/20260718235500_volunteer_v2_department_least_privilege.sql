-- Replace remaining company-wide reads with department/self scoped reads.

drop policy if exists "volunteer departments scoped read" on public.volunteer_departments;
create policy "volunteer departments scoped read" on public.volunteer_departments for select to authenticated
using (
  public.can_manage_volunteer_department(id)
  or exists (
    select 1 from public.volunteer_department_memberships membership
    where membership.department_id = volunteer_departments.id
      and membership.volunteer_id = public.volunteer_current_id()
      and membership.is_active
  )
);

drop policy if exists "volunteer roles scoped read" on public.volunteer_department_roles;
create policy "volunteer roles scoped read" on public.volunteer_department_roles for select to authenticated
using (
  public.can_manage_volunteer_department(department_id)
  or exists (
    select 1 from public.volunteer_department_memberships membership
    where membership.department_id = volunteer_department_roles.department_id
      and membership.volunteer_id = public.volunteer_current_id()
      and membership.is_active
  )
);

drop policy if exists "volunteer access scoped read" on public.volunteer_department_access;
create policy "volunteer access scoped read" on public.volunteer_department_access for select to authenticated
using (
  public.can_manage_volunteer_department(department_id)
  or profile_id = public.volunteer_current_profile_id()
);

drop policy if exists "volunteer templates scoped read" on public.volunteer_schedule_templates;
create policy "volunteer templates scoped read" on public.volunteer_schedule_templates for select to authenticated
using (
  public.can_manage_volunteer_company(company_id)
  or exists (
    select 1 from public.volunteer_schedule_template_slots slot
    where slot.template_id = volunteer_schedule_templates.id
      and public.can_manage_volunteer_department(slot.department_id)
  )
);

drop policy if exists "volunteer template slots scoped read" on public.volunteer_schedule_template_slots;
create policy "volunteer template slots scoped read" on public.volunteer_schedule_template_slots for select to authenticated
using (public.can_manage_volunteer_department(department_id));

drop policy if exists "volunteer schedules scoped read" on public.volunteer_schedules;
create policy "volunteer schedules scoped read" on public.volunteer_schedules for select to authenticated
using (
  public.can_manage_volunteer_company(company_id)
  or exists (
    select 1 from public.volunteer_shifts shift
    where shift.schedule_id = volunteer_schedules.id
      and public.can_access_volunteer_shift(shift.id)
  )
);

drop policy if exists "volunteer availability rules scoped read" on public.volunteer_availability_rules;
create policy "volunteer availability rules scoped read" on public.volunteer_availability_rules for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_view_volunteer(volunteer_id));

drop policy if exists "volunteer availability exceptions scoped read" on public.volunteer_availability_exceptions;
create policy "volunteer availability exceptions scoped read" on public.volunteer_availability_exceptions for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_view_volunteer(volunteer_id));

drop policy if exists "volunteer role preferences scoped read" on public.volunteer_role_preferences;
create policy "volunteer role preferences scoped read" on public.volunteer_role_preferences for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_view_volunteer(volunteer_id));

drop policy if exists "volunteer swaps scoped read" on public.volunteer_swap_requests;
create policy "volunteer swaps scoped read" on public.volunteer_swap_requests for select to authenticated
using (
  requested_by_volunteer_id = public.volunteer_current_id()
  or replacement_volunteer_id = public.volunteer_current_id()
  or exists (
    select 1
    from public.volunteer_assignments assignment
    join public.volunteer_shifts shift on shift.id = assignment.shift_id
    where assignment.id = volunteer_swap_requests.assignment_id
      and public.can_manage_volunteer_department(shift.department_id)
  )
);

drop policy if exists "volunteer feedback scoped read" on public.volunteer_feedbacks;
create policy "volunteer feedback scoped read" on public.volunteer_feedbacks for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_view_volunteer(volunteer_id));

drop policy if exists "volunteer recognition private read" on public.volunteer_recognitions;
create policy "volunteer recognition private read" on public.volunteer_recognitions for select to authenticated
using (volunteer_id = public.volunteer_current_id() or public.can_view_volunteer(volunteer_id));

drop policy if exists "volunteer setlists scoped read" on public.volunteer_event_setlists;
create policy "volunteer setlists scoped read" on public.volunteer_event_setlists for select to authenticated
using (
  public.can_manage_volunteer_company(company_id)
  or exists (
    select 1 from public.volunteer_shifts shift
    where shift.event_id = volunteer_event_setlists.event_id
      and public.can_access_volunteer_shift(shift.id)
  )
);

drop policy if exists "volunteer setlist items scoped read" on public.volunteer_event_setlist_items;
create policy "volunteer setlist items scoped read" on public.volunteer_event_setlist_items for select to authenticated
using (
  exists (
    select 1 from public.volunteer_event_setlists setlist
    where setlist.id = volunteer_event_setlist_items.setlist_id
      and (
        public.can_manage_volunteer_company(setlist.company_id)
        or exists (
          select 1 from public.volunteer_shifts shift
          where shift.event_id = setlist.event_id and public.can_access_volunteer_shift(shift.id)
        )
      )
  )
);

drop policy if exists "volunteer timeline scoped read" on public.volunteer_event_timeline_items;
create policy "volunteer timeline scoped read" on public.volunteer_event_timeline_items for select to authenticated
using (
  public.can_manage_volunteer_company(company_id)
  or exists (
    select 1 from public.volunteer_shifts shift
    where shift.event_id = volunteer_event_timeline_items.event_id
      and public.can_access_volunteer_shift(shift.id)
  )
);
