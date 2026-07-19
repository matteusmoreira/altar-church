-- Explicit audience policies for service-oriented volunteer tables. Authenticated
-- writes remain revoked; these policies make least-privilege reads auditable.

create policy volunteer_checkin_qr_sessions_manager_select
on public.volunteer_checkin_qr_sessions for select to authenticated
using (
  exists (
    select 1 from public.volunteer_shifts shift
    where shift.id = volunteer_checkin_qr_sessions.shift_id
      and public.can_manage_volunteer_department(shift.department_id)
  )
);

create policy volunteer_delivery_outbox_manager_select
on public.volunteer_delivery_outbox for select to authenticated
using (public.can_manage_volunteer_company(company_id));

create policy volunteer_feed_posts_audience_select
on public.volunteer_feed_posts for select to authenticated
using (
  public.can_manage_volunteer_company(company_id)
  or (
    status = 'published'
    and public.is_company_member(company_id)
    and (
      audience = 'all'
      or exists (
        select 1
        from public.volunteer_feed_post_departments target
        join public.volunteer_department_memberships membership
          on membership.department_id = target.department_id
         and membership.is_active
        where target.post_id = volunteer_feed_posts.id
          and membership.volunteer_id = public.volunteer_current_id()
      )
    )
  )
);

create policy volunteer_message_files_audience_select
on public.volunteer_message_files for select to authenticated
using (
  exists (
    select 1
    from public.volunteer_shift_messages message
    join public.volunteer_shift_conversations conversation on conversation.id = message.conversation_id
    where message.id = volunteer_message_files.message_id
      and public.can_access_volunteer_shift(conversation.shift_id)
  )
);

create policy volunteer_shift_files_audience_select
on public.volunteer_shift_files for select to authenticated
using (public.can_access_volunteer_shift(shift_id));

create index if not exists volunteer_department_access_company_idx
  on public.volunteer_department_access(company_id, profile_id);
create index if not exists volunteer_department_roles_company_idx
  on public.volunteer_department_roles(company_id, department_id) where deleted_at is null;
create index if not exists volunteer_event_setlist_items_responsible_idx
  on public.volunteer_event_setlist_items(responsible_profile_id) where responsible_profile_id is not null;
create index if not exists volunteer_event_timeline_responsible_idx
  on public.volunteer_event_timeline_items(responsible_profile_id) where responsible_profile_id is not null;
create index if not exists volunteer_recognitions_granted_by_idx
  on public.volunteer_recognitions(granted_by) where granted_by is not null;
create index if not exists volunteer_swap_reviewed_by_idx
  on public.volunteer_swap_requests(reviewed_by) where reviewed_by is not null;
