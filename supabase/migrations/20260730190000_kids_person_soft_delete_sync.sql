-- Keep Kids records aligned with the soft-delete lifecycle of people.
-- A deleted person must not leave an active child/guardian relation behind.

create or replace function public.sync_kids_after_person_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.kid_profiles
    set deleted_at = coalesce(deleted_at, new.deleted_at),
        updated_at = now()
    where person_id = new.id
      and deleted_at is null;

    update public.kid_guardians
    set deleted_at = coalesce(deleted_at, new.deleted_at),
        updated_at = now()
    where person_id = new.id
      and deleted_at is null;

    update public.kid_health_profiles health
    set deleted_at = coalesce(health.deleted_at, new.deleted_at),
        updated_at = now()
    where exists (
      select 1
      from public.kid_profiles kid
      where kid.id = health.kid_id
        and kid.person_id = new.id
        and kid.deleted_at is not null
    )
      and health.deleted_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists people_soft_delete_kids_sync on public.people;
create trigger people_soft_delete_kids_sync
after update of deleted_at on public.people
for each row
when (new.deleted_at is not null and old.deleted_at is null)
execute function public.sync_kids_after_person_soft_delete();

-- Repair historical orphaned active records left by earlier people soft-deletes.
update public.kid_profiles kid
set deleted_at = coalesce(kid.deleted_at, person.deleted_at),
    updated_at = now()
from public.people person
where person.id = kid.person_id
  and person.deleted_at is not null
  and kid.deleted_at is null;

update public.kid_guardians guardian
set deleted_at = now(),
    updated_at = now()
where guardian.deleted_at is null
  and (
    exists (
      select 1
      from public.people person
      where person.id = guardian.person_id
        and person.deleted_at is not null
    )
    or exists (
      select 1
      from public.kid_profiles kid
      where kid.id = guardian.kid_id
        and kid.deleted_at is not null
    )
  );

update public.kid_health_profiles health
set deleted_at = now(),
    updated_at = now()
where health.deleted_at is null
  and exists (
    select 1
    from public.kid_profiles kid
    where kid.id = health.kid_id
      and kid.deleted_at is not null
  );
