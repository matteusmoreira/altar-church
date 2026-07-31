-- Cell leader ownership and group membership stay synchronized.

create index if not exists groups_active_leader_idx
  on public.groups(company_id, leader_person_id)
  where type = 'cell' and deleted_at is null;

create index if not exists group_members_company_person_group_idx
  on public.group_members(company_id, person_id, group_id)
  where status = 'active';

create or replace function public.sync_cell_group_leader_member()
returns trigger
language plpgsql
security definer
set search_path = public
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
  end if;

  if new.deleted_at is not null or new.is_active = false or new.type <> 'cell' then
    update public.group_members
    set role = 'member', status = 'inactive', left_at = coalesce(left_at, current_date), updated_at = now()
    where company_id = new.company_id
      and group_id = new.id
      and person_id = new.leader_person_id
      and role = 'leader';
    return new;
  end if;

  if new.type = 'cell' and new.leader_person_id is not null then
    insert into public.group_members (company_id, group_id, person_id, role, status, created_by, updated_by)
    values (new.company_id, new.id, new.leader_person_id, 'leader', 'active', new.updated_by, new.updated_by)
    on conflict (group_id, person_id) do update
    set role = 'leader', status = 'active', left_at = null, updated_by = excluded.updated_by, updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists groups_sync_cell_leader_member on public.groups;
create trigger groups_sync_cell_leader_member
after insert or update of company_id, leader_person_id, deleted_at, is_active, type on public.groups
for each row execute function public.sync_cell_group_leader_member();

update public.group_members member
set role = 'member',
    status = case when cell.deleted_at is not null or cell.is_active = false or cell.type <> 'cell' then 'inactive' else member.status end,
    left_at = case when cell.deleted_at is not null or cell.is_active = false or cell.type <> 'cell' then coalesce(member.left_at, current_date) else member.left_at end,
    updated_at = now()
from public.groups cell
where member.group_id = cell.id
  and member.role = 'leader'
  and (cell.type <> 'cell' or cell.deleted_at is not null or cell.is_active = false or cell.leader_person_id is distinct from member.person_id);

update public.groups group_row
set leader_person_id = null, updated_at = now()
where group_row.type = 'cell'
  and group_row.is_active = true
  and group_row.deleted_at is null
  and group_row.leader_person_id is not null
  and not exists (
    select 1
    from public.people person
    where person.id = group_row.leader_person_id
      and person.company_id = group_row.company_id
      and person.is_active = true
      and person.deleted_at is null
  );

insert into public.group_members (company_id, group_id, person_id, role, status)
select group_row.company_id, group_row.id, group_row.leader_person_id, 'leader', 'active'
from public.groups group_row
join public.people person on person.id = group_row.leader_person_id
where group_row.type = 'cell'
  and group_row.is_active = true
  and group_row.deleted_at is null
  and person.company_id = group_row.company_id
  and person.is_active = true
  and person.deleted_at is null
on conflict (group_id, person_id) do update
set role = 'leader', status = 'active', left_at = null, updated_at = now();

create or replace function public.sync_cell_leader_assignments(
  target_company_id uuid,
  target_person_id uuid,
  target_cell_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.people
    where id = target_person_id and company_id = target_company_id and is_active = true and deleted_at is null
  ) then
    raise exception 'Pessoa inválida para esta igreja';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_cell_ids, '{}'::uuid[])) requested(id)
    left join public.groups group_row
      on group_row.id = requested.id
     and group_row.company_id = target_company_id
     and group_row.type = 'cell'
     and group_row.is_active = true
     and group_row.deleted_at is null
    where group_row.id is null
  ) then
    raise exception 'Célula inválida para esta igreja';
  end if;

  update public.groups
  set leader_person_id = null, updated_at = now()
  where company_id = target_company_id
    and type = 'cell'
    and is_active = true
    and deleted_at is null
    and leader_person_id = target_person_id
    and not (id = any(coalesce(target_cell_ids, '{}'::uuid[])));

  update public.groups
  set leader_person_id = target_person_id, updated_at = now()
  where company_id = target_company_id
    and type = 'cell'
    and is_active = true
    and deleted_at is null
    and id = any(coalesce(target_cell_ids, '{}'::uuid[]));
end;
$$;

revoke all on function public.sync_cell_leader_assignments(uuid, uuid, uuid[]) from public;
grant execute on function public.sync_cell_leader_assignments(uuid, uuid, uuid[]) to authenticated;
