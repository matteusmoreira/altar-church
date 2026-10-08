-- Additive: the previous application can continue to read and write tasks.
alter table public.person_follow_up_tasks add column if not exists next_action text;

-- Restrictive policy also covers pre-existing permissive policies on this table.
drop policy if exists ministry_follow_up_management_only on public.person_follow_up_tasks;
create policy ministry_follow_up_management_only on public.person_follow_up_tasks
as restrictive for all to authenticated
using (ministry_id is null or public.can_manage_ministry(ministry_id))
with check (ministry_id is null or public.can_manage_ministry(ministry_id));
