-- Remove inherited PUBLIC execution from internal RLS/event-trigger helpers.
revoke execute on function public.can_access_cell_meeting(uuid) from public, anon;
revoke execute on function public.can_access_cell_study(uuid) from public, anon;
revoke execute on function public.can_manage_cell(uuid) from public, anon;
revoke execute on function public.cell_current_person_id() from public, anon;
revoke execute on function public.cell_current_profile_id() from public, anon;
revoke execute on function public.is_cell_participant(uuid) from public, anon;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Cell policies execute these helpers for signed-in church users.
grant execute on function public.can_access_cell_meeting(uuid) to authenticated;
grant execute on function public.can_access_cell_study(uuid) to authenticated;
grant execute on function public.can_manage_cell(uuid) to authenticated;
grant execute on function public.cell_current_person_id() to authenticated;
grant execute on function public.cell_current_profile_id() to authenticated;
grant execute on function public.is_cell_participant(uuid) to authenticated;

grant execute on function public.rls_auto_enable() to postgres;
