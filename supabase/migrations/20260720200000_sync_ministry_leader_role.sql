-- Keep ministry leadership, membership and the linked access profile consistent.
create or replace function public.sync_ministry_leader_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_leader_id uuid;
  current_leader_id uuid;
begin
  previous_leader_id := case when tg_op = 'UPDATE' then old.leader_person_id else null end;
  current_leader_id := new.leader_person_id;

  if current_leader_id is not null
     and new.deleted_at is null
     and (
       tg_op = 'INSERT'
       or current_leader_id is distinct from previous_leader_id
       or new.company_id is distinct from old.company_id
       or old.deleted_at is not null
     ) then
    if not exists (
      select 1
      from public.people person
      where person.id = current_leader_id
        and person.company_id = new.company_id
        and person.deleted_at is null
        and person.is_active = true
    ) then
      raise exception 'Lider do ministerio deve pertencer a mesma igreja';
    end if;

    insert into public.ministry_memberships (
      company_id, ministry_id, person_id, role, status, joined_at
    )
    values (
      new.company_id, new.id, current_leader_id, 'leader', 'active', now()
    )
    on conflict (ministry_id, person_id) do update
    set company_id = excluded.company_id,
        role = 'leader',
        status = 'active',
        reviewed_by = null,
        reviewed_at = now(),
        joined_at = coalesce(public.ministry_memberships.joined_at, now());

    update public.profiles profile
    set role = 'ministry_leader',
        updated_at = now()
    where profile.company_id = new.company_id
      and profile.active = true
      and profile.role = 'member'
      and (
        profile.person_id = current_leader_id
        or exists (
          select 1
          from public.people person
          where person.id = current_leader_id
            and person.profile_id = profile.id
            and person.deleted_at is null
        )
      );

    update public.people
    set access_profile = 'ministry_leader',
        person_type = 'leader',
        updated_at = now()
    where id = current_leader_id
      and company_id = new.company_id
      and access_profile = 'member';
  end if;

  if previous_leader_id is not null
     and (
       previous_leader_id is distinct from current_leader_id
       or new.deleted_at is not null
     ) then
    update public.ministry_memberships
    set role = 'member',
        updated_at = now()
    where company_id = new.company_id
      and ministry_id = new.id
      and person_id = previous_leader_id
      and role = 'leader';

    if not exists (
      select 1
      from public.ministries ministry
      where ministry.company_id = new.company_id
        and ministry.leader_person_id = previous_leader_id
        and ministry.deleted_at is null
        and ministry.id <> new.id
    ) then
      update public.profiles profile
      set role = 'member',
          updated_at = now()
      where profile.company_id = new.company_id
        and profile.role = 'ministry_leader'
        and (
          profile.person_id = previous_leader_id
          or exists (
            select 1
            from public.people person
            where person.id = previous_leader_id
              and person.profile_id = profile.id
              and person.deleted_at is null
          )
        );

      update public.people
      set access_profile = 'member',
          updated_at = now()
      where id = previous_leader_id
        and company_id = new.company_id
        and access_profile = 'ministry_leader';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ministries_sync_leader_role on public.ministries;
create trigger ministries_sync_leader_role
after insert or update of leader_person_id, company_id, deleted_at
on public.ministries
for each row execute function public.sync_ministry_leader_role();

-- Repair ministries created after the member-portal migration.
insert into public.ministry_memberships (
  company_id, ministry_id, person_id, role, status, joined_at
)
select ministry.company_id, ministry.id, ministry.leader_person_id, 'leader', 'active', now()
from public.ministries ministry
join public.people person
  on person.id = ministry.leader_person_id
 and person.company_id = ministry.company_id
 and person.deleted_at is null
 and person.is_active = true
where ministry.leader_person_id is not null
  and ministry.deleted_at is null
on conflict (ministry_id, person_id) do update
set company_id = excluded.company_id,
    role = 'leader',
    status = 'active',
    reviewed_by = null,
    reviewed_at = now(),
    joined_at = coalesce(public.ministry_memberships.joined_at, now());

update public.profiles profile
set role = 'ministry_leader',
    updated_at = now()
from public.people person
where person.company_id = profile.company_id
  and (person.profile_id = profile.id or profile.person_id = person.id)
  and person.deleted_at is null
  and profile.active = true
  and profile.role = 'member'
  and exists (
    select 1
    from public.ministries ministry
    where ministry.company_id = person.company_id
      and ministry.leader_person_id = person.id
      and ministry.deleted_at is null
  );

update public.people person
set access_profile = 'ministry_leader',
    person_type = 'leader',
    updated_at = now()
where person.access_profile = 'member'
  and person.deleted_at is null
  and exists (
    select 1
    from public.ministries ministry
    where ministry.company_id = person.company_id
      and ministry.leader_person_id = person.id
      and ministry.deleted_at is null
  );

analyze public.ministry_memberships;
analyze public.profiles;
analyze public.people;
