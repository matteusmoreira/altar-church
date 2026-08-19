-- Keep cell ownership, membership, pastoral type and portal role consistent.
create or replace function public.sync_cell_group_leader_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_leader_id uuid;
begin
  previous_leader_id := case when tg_op = 'UPDATE' then old.leader_person_id else null end;

  if previous_leader_id is not null and previous_leader_id is distinct from new.leader_person_id then
    update public.group_members
    set role = 'member', updated_at = now()
    where company_id = old.company_id
      and group_id = old.id
      and person_id = previous_leader_id
      and role = 'leader';

    if not exists (
      select 1
      from public.groups other_cell
      where other_cell.company_id = old.company_id
        and other_cell.type = 'cell'
        and other_cell.is_active = true
        and other_cell.deleted_at is null
        and other_cell.leader_person_id = previous_leader_id
    ) then
      update public.profiles profile
      set role = 'member', updated_at = now()
      where profile.company_id = old.company_id
        and profile.role = 'cell_leader'
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
      set access_profile = 'member', updated_at = now()
      where id = previous_leader_id
        and company_id = old.company_id
        and access_profile = 'cell_leader';
    end if;
  end if;

  if new.deleted_at is not null or new.is_active = false or new.type <> 'cell' then
    update public.group_members
    set role = 'member', status = 'inactive', left_at = coalesce(left_at, current_date), updated_at = now()
    where company_id = new.company_id
      and group_id = new.id
      and person_id = new.leader_person_id
      and role = 'leader';

    if new.leader_person_id is not null and not exists (
      select 1
      from public.groups other_cell
      where other_cell.company_id = new.company_id
        and other_cell.type = 'cell'
        and other_cell.is_active = true
        and other_cell.deleted_at is null
        and other_cell.leader_person_id = new.leader_person_id
    ) then
      update public.profiles profile
      set role = 'member', updated_at = now()
      where profile.company_id = new.company_id
        and profile.role = 'cell_leader'
        and (
          profile.person_id = new.leader_person_id
          or exists (
            select 1
            from public.people person
            where person.id = new.leader_person_id
              and person.profile_id = profile.id
              and person.deleted_at is null
          )
        );

      update public.people
      set access_profile = 'member', updated_at = now()
      where id = new.leader_person_id
        and company_id = new.company_id
        and access_profile = 'cell_leader';
    end if;

    return new;
  end if;

  if new.leader_person_id is not null then
    if not exists (
      select 1
      from public.people person
      where person.id = new.leader_person_id
        and person.company_id = new.company_id
        and person.is_active = true
        and person.deleted_at is null
    ) then
      raise exception 'Lider da celula deve pertencer a mesma igreja';
    end if;

    insert into public.group_members (company_id, group_id, person_id, role, status, created_by, updated_by)
    values (new.company_id, new.id, new.leader_person_id, 'leader', 'active', new.updated_by, new.updated_by)
    on conflict (group_id, person_id) do update
    set role = 'leader', status = 'active', left_at = null, updated_by = excluded.updated_by, updated_at = now();

    update public.profiles profile
    set role = 'cell_leader', updated_at = now()
    where profile.company_id = new.company_id
      and profile.active = true
      and profile.role = 'member'
      and (
        profile.person_id = new.leader_person_id
        or exists (
          select 1
          from public.people person
          where person.id = new.leader_person_id
            and person.profile_id = profile.id
            and person.deleted_at is null
        )
      );

    update public.people
    set access_profile = case when access_profile = 'member' then 'cell_leader' else access_profile end,
        person_type = 'leader',
        updated_at = now()
    where id = new.leader_person_id
      and company_id = new.company_id;
  end if;

  return new;
end;
$$;

-- Repair leaders assigned before role synchronization existed.
update public.profiles profile
set role = 'cell_leader', updated_at = now()
from public.people person
where person.company_id = profile.company_id
  and (profile.person_id = person.id or person.profile_id = profile.id)
  and person.deleted_at is null
  and profile.active = true
  and profile.role = 'member'
  and exists (
    select 1
    from public.groups cell
    where cell.company_id = person.company_id
      and cell.type = 'cell'
      and cell.is_active = true
      and cell.deleted_at is null
      and cell.leader_person_id = person.id
  );

update public.people person
set access_profile = case when person.access_profile = 'member' then 'cell_leader' else person.access_profile end,
    person_type = 'leader',
    updated_at = now()
where person.deleted_at is null
  and exists (
    select 1
    from public.groups cell
    where cell.company_id = person.company_id
      and cell.type = 'cell'
      and cell.is_active = true
      and cell.deleted_at is null
      and cell.leader_person_id = person.id
  );

analyze public.profiles;
analyze public.people;
