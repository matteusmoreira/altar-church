-- Targeted indexes for cell portal/check-in paths. Avoid broad over-indexing on a small database.
create index if not exists attendance_cell_meeting_status_idx
  on public.attendance_records(event_ref_id, status)
  where event_type = 'cell' and deleted_at is null;

create index if not exists cell_checkin_sessions_company_group_created_idx
  on public.cell_checkin_sessions(company_id, group_id, created_at desc);

create index if not exists cell_prayer_requests_author_idx
  on public.cell_prayer_requests(company_id, author_profile_id, created_at desc)
  where deleted_at is null;

create index if not exists people_company_phone_digits_idx
  on public.people(company_id, regexp_replace(phone, '\D', '', 'g'))
  where deleted_at is null;

-- These duplicate unique indexes already maintained by constraints.
drop index if exists public.profiles_auth_user_id_idx;
drop index if exists public.church_profiles_company_id_idx;

-- Keep admin study access tenant-scoped. Superadmin remains global.
create or replace function public.can_access_cell_study(target_study_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.group_studies study
    left join public.cell_study_targets target on target.study_id = study.id
    where study.id = target_study_id and study.deleted_at is null and study.is_active = true
      and (
        (study.audience = 'all' and exists(
          select 1 from public.group_members member join public.groups cell on cell.id = member.group_id
          where member.person_id = public.cell_current_person_id() and member.status = 'active'
            and member.company_id = study.company_id and cell.type = 'cell' and cell.deleted_at is null
        ))
        or (target.group_id is not null and (public.can_manage_cell(target.group_id) or public.is_cell_participant(target.group_id)))
        or exists(
          select 1 from public.profiles profile
          where profile.auth_user_id = auth.uid() and profile.active = true
            and (profile.role = 'superadmin' or (profile.role = 'admin' and profile.company_id = study.company_id))
        )
      )
  )
$$;

analyze public.attendance_records;
analyze public.cell_checkin_sessions;
analyze public.cell_prayer_requests;
analyze public.people;
