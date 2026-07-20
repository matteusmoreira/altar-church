-- Portal unificado: personas comuns compartilham o papel técnico member.
update auth.users auth_user
set raw_user_meta_data = jsonb_set(
  coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"member"'::jsonb,
  true
)
from public.profiles profile
join public.people person
  on person.company_id = profile.company_id
 and (person.profile_id = profile.id or profile.person_id = person.id)
 and person.deleted_at is null
where profile.auth_user_id = auth_user.id
  and person.person_type in ('visitor', 'attendee')
  and profile.role in ('member', 'volunteer', 'ministry_leader');

update public.profiles profile
set role = 'member',
    updated_at = now()
from public.people person
where person.company_id = profile.company_id
  and (person.profile_id = profile.id or profile.person_id = person.id)
  and person.deleted_at is null
  and person.person_type in ('visitor', 'attendee')
  and profile.role in ('member', 'volunteer', 'ministry_leader');

update public.people
set access_profile = 'member',
    updated_at = now()
where person_type in ('visitor', 'attendee')
  and deleted_at is null
  and access_profile is distinct from 'member';

-- Participação: usuário do portal cuida somente da própria solicitação.
drop policy if exists "Members request ministry participation" on public.ministry_memberships;
drop policy if exists "Portal users request ministry participation" on public.ministry_memberships;
create policy "Portal users request ministry participation"
on public.ministry_memberships for insert to authenticated
with check (
  status = 'pending'
  and role = 'member'
  and exists (
    select 1
    from public.profiles profile
    join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.role in ('member', 'volunteer', 'ministry_leader')
      and profile.company_id = ministry_memberships.company_id
      and person.id = ministry_memberships.person_id
      and profile.id = ministry_memberships.requested_by
  )
);

drop policy if exists "Ministry memberships scoped update" on public.ministry_memberships;
drop policy if exists "Ministry memberships self or admin update" on public.ministry_memberships;
create policy "Ministry memberships self or admin update"
on public.ministry_memberships for update to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    left join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        profile.role = 'superadmin'
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role in ('admin', 'pastor')
        )
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role in ('member', 'volunteer', 'ministry_leader')
          and person.id = ministry_memberships.person_id
          and ministry_memberships.role = 'member'
          and ministry_memberships.status = 'pending'
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    left join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        profile.role = 'superadmin'
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role in ('admin', 'pastor')
        )
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role in ('member', 'volunteer', 'ministry_leader')
          and person.id = ministry_memberships.person_id
          and ministry_memberships.role = 'member'
          and ministry_memberships.status = 'inactive'
        )
      )
  )
);

-- Ministérios: administração mantém gestão; líder edita somente campos operacionais.
drop policy if exists "Company members insert rows" on public.ministries;
drop policy if exists "Company members update rows" on public.ministries;
drop policy if exists "Company members delete rows" on public.ministries;
drop policy if exists "Ministry administrators insert" on public.ministries;
drop policy if exists "Ministry administrators update" on public.ministries;
drop policy if exists "Ministry leaders update own" on public.ministries;
drop policy if exists "Ministry administrators delete" on public.ministries;

create policy "Ministry administrators insert"
on public.ministries for insert to authenticated
with check (
  (select public.is_superadmin())
  or exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.company_id = ministries.company_id
      and profile.role in ('admin', 'pastor')
  )
);

create policy "Ministry administrators update"
on public.ministries for update to authenticated
using (
  (select public.is_superadmin())
  or exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.company_id = ministries.company_id
      and profile.role in ('admin', 'pastor')
  )
)
with check (
  (select public.is_superadmin())
  or exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.company_id = ministries.company_id
      and profile.role in ('admin', 'pastor')
  )
);

create policy "Ministry leaders update own"
on public.ministries for update to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.role in ('member', 'volunteer', 'ministry_leader')
      and profile.company_id = ministries.company_id
      and person.id = ministries.leader_person_id
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    join public.people person
      on person.company_id = profile.company_id
     and (person.profile_id = profile.id or profile.person_id = person.id)
     and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.role in ('member', 'volunteer', 'ministry_leader')
      and profile.company_id = ministries.company_id
      and person.id = ministries.leader_person_id
  )
);

create policy "Ministry administrators delete"
on public.ministries for delete to authenticated
using (
  (select public.is_superadmin())
  or exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.company_id = ministries.company_id
      and profile.role in ('admin', 'pastor')
  )
);

revoke insert, update, delete on public.ministries from authenticated;
grant insert, delete on public.ministries to authenticated;
grant update (name, description, contact, is_active) on public.ministries to authenticated;

analyze public.profiles;
analyze public.people;
analyze public.ministries;
analyze public.ministry_memberships;
