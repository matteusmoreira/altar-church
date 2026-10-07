-- Persist all selected roles; role remains the canonical primary for legacy readers.
alter table public.profiles add column roles text[];
update public.profiles set roles = array[role];
alter table public.profiles alter column roles set not null;
alter table public.profiles add constraint profiles_roles_check check (
  cardinality(roles) > 0 and roles <@ array['superadmin','admin','pastor','ministry_leader','cell_supervisor','cell_leader','communication','finance','volunteer','member']::text[]
  and role = roles[1]
  and (not ('superadmin' = any(roles)) or roles = array['superadmin']::text[])
);

create or replace function public.normalize_profile_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.roles is null then new.roles := array[new.role];
  elsif tg_op = 'UPDATE' and new.roles is not distinct from old.roles and new.role is distinct from old.role then
    -- Legacy callers change a primary role without discarding other assignments.
    new.roles := array_prepend(new.role, array_remove(array_remove(new.roles, old.role), new.role));
  end if;
  select array_agg(r order by array_position(array['superadmin','admin','pastor','cell_supervisor','communication','finance','cell_leader','ministry_leader','volunteer','member']::text[], r)) into new.roles from (
    select r, min(priority) priority from unnest(new.roles) with ordinality as assigned(r, priority) group by r
  ) deduplicated;
  new.role := new.roles[1];
  return new;
end;
$$;
revoke all on function public.normalize_profile_roles() from public, anon, authenticated;
create trigger profiles_normalize_roles before insert or update of role, roles on public.profiles
for each row execute function public.normalize_profile_roles();

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
      set roles = case when cardinality(array_remove(profile.roles, 'cell_leader')) = 0 then array['member']::text[] else array_remove(profile.roles, 'cell_leader') end, updated_at = now()
      where profile.company_id = old.company_id
        and 'cell_leader' = any(profile.roles)
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
    set role = 'member', updated_at = now()
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
      set roles = case when cardinality(array_remove(profile.roles, 'cell_leader')) = 0 then array['member']::text[] else array_remove(profile.roles, 'cell_leader') end, updated_at = now()
      where profile.company_id = new.company_id
        and 'cell_leader' = any(profile.roles)
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
    set roles = array_append(profile.roles, 'cell_leader'), updated_at = now()
    where profile.company_id = new.company_id
      and profile.active = true
      and not ('cell_leader' = any(profile.roles)) and profile.role <> 'superadmin'
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
    set roles = array_append(profile.roles, 'ministry_leader'),
        updated_at = now()
    where profile.company_id = new.company_id
      and profile.active = true
      and not ('ministry_leader' = any(profile.roles)) and profile.role <> 'superadmin'
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
      set roles = case when cardinality(array_remove(profile.roles, 'ministry_leader')) = 0 then array['member']::text[] else array_remove(profile.roles, 'ministry_leader') end,
          updated_at = now()
      where profile.company_id = new.company_id
        and 'ministry_leader' = any(profile.roles)
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

update public.profiles profile set roles = array_append(profile.roles, 'cell_leader')
where profile.active and profile.deleted_at is null and profile.role <> 'superadmin'
  and not ('cell_leader' = any(profile.roles)) and exists (
    select 1 from public.people person join public.groups entity
      on entity.company_id = person.company_id and entity.leader_person_id = person.id
    where person.company_id = profile.company_id and (person.id = profile.person_id or person.profile_id = profile.id)
      and person.deleted_at is null and entity.deleted_at is null and entity.type = 'cell' and entity.is_active = true
  );
update public.profiles profile set roles = array_append(profile.roles, 'ministry_leader')
where profile.active and profile.deleted_at is null and profile.role <> 'superadmin'
  and not ('ministry_leader' = any(profile.roles)) and exists (
    select 1 from public.people person join public.ministries entity
      on entity.company_id = person.company_id and entity.leader_person_id = person.id
    where person.company_id = profile.company_id and (person.id = profile.person_id or person.profile_id = profile.id)
      and person.deleted_at is null and entity.deleted_at is null
  );

create or replace function public.can_manage_cell(target_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.groups cell
    join public.profiles profile on profile.company_id = cell.company_id and profile.auth_user_id = auth.uid() and profile.active = true and profile.deleted_at is null
    where cell.id = target_group_id and cell.type = 'cell' and cell.deleted_at is null
      and (profile.roles && array['superadmin', 'admin']::text[]
        or ('cell_supervisor' = any(profile.roles) and cell.coordinator_person_id = coalesce(profile.person_id, public.cell_current_person_id()))
        or ('cell_leader' = any(profile.roles) and cell.leader_person_id = coalesce(profile.person_id, public.cell_current_person_id())))
  )
$$;

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
          where profile.auth_user_id = auth.uid() and profile.active = true and profile.deleted_at is null
            and ('superadmin' = any(profile.roles) or ('admin' = any(profile.roles) and profile.company_id = study.company_id))
        )
      )
  )
$$;

create or replace function public.can_access_ministry(target_ministry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    join public.ministries ministry on ministry.id = target_ministry_id
      and ministry.deleted_at is null and (profile.role = 'superadmin' or ministry.company_id = profile.company_id)
    where profile.id = (select public.ministry_current_profile_id())
      and profile.active = true and profile.deleted_at is null and profile.roles && array['superadmin','admin','pastor']::text[]
  ) or exists (
    select 1 from public.ministry_memberships membership
    join public.ministries ministry on ministry.id = membership.ministry_id
      and ministry.company_id = membership.company_id and ministry.deleted_at is null
    join public.profiles profile on profile.id = (select public.ministry_current_profile_id())
      and profile.company_id = membership.company_id and profile.active and profile.deleted_at is null
    where membership.ministry_id = target_ministry_id
      and membership.person_id = (select public.ministry_current_person_id())
      and membership.status = 'active' and membership.left_at is null
  )
$$;

create or replace function public.can_manage_ministry(target_ministry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    join public.ministries ministry on ministry.id = target_ministry_id
      and ministry.deleted_at is null and (profile.role = 'superadmin' or ministry.company_id = profile.company_id)
    where profile.id = (select public.ministry_current_profile_id())
      and profile.active = true and profile.deleted_at is null and profile.roles && array['superadmin','admin','pastor']::text[]
  ) or exists (
    select 1 from public.ministry_memberships membership
    join public.ministries ministry on ministry.id = membership.ministry_id
      and ministry.company_id = membership.company_id and ministry.deleted_at is null
    join public.profiles profile on profile.id = (select public.ministry_current_profile_id())
      and profile.company_id = membership.company_id and profile.active and profile.deleted_at is null
    where membership.ministry_id = target_ministry_id
      and membership.person_id = (select public.ministry_current_person_id())
      and membership.role in ('leader','coordinator')
      and membership.status = 'active' and membership.left_at is null
  )
$$;
