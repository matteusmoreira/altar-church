-- Link existing people by unique company/email match before creating missing identities.
with candidates as (
  select profile.id as profile_id, min(person.id::text)::uuid as person_id
  from public.profiles profile
  join public.people person
    on person.company_id = profile.company_id
   and lower(person.email) = lower(profile.email)
   and person.deleted_at is null
   and (person.profile_id is null or person.profile_id = profile.id)
  where profile.company_id is not null and profile.person_id is null
  group by profile.id
  having count(*) = 1
)
update public.profiles profile
set person_id = candidates.person_id
from candidates
where profile.id = candidates.profile_id;

update public.people person
set profile_id = profile.id,
    updated_at = now()
from public.profiles profile
where profile.person_id = person.id
  and person.profile_id is null
  and person.deleted_at is null;

-- Every church profile needs a person identity for portal authorization.
insert into public.people (
  company_id, first_name, last_name, full_name, email, access_profile,
  status, person_type, is_active, profile_id, created_by, updated_by
)
select
  profile.company_id,
  split_part(coalesce(nullif(btrim(profile.name), ''), 'Usuário'), ' ', 1),
  case
    when position(' ' in btrim(profile.name)) > 0
      then btrim(substring(btrim(profile.name) from position(' ' in btrim(profile.name)) + 1))
    else ''
  end,
  coalesce(nullif(btrim(profile.name), ''), 'Usuário'),
  nullif(btrim(profile.email), ''),
  profile.role,
  case when profile.active then 'active' else 'inactive' end,
  case
    when profile.role in ('cell_leader', 'cell_supervisor', 'ministry_leader', 'pastor') then 'leader'
    when profile.role = 'volunteer' then 'volunteer'
    else 'member'
  end,
  profile.active,
  profile.id,
  profile.id,
  profile.id
from public.profiles profile
where profile.company_id is not null
  and profile.person_id is null
  and not exists (
    select 1 from public.people person
    where person.profile_id = profile.id and person.deleted_at is null
  );

update public.profiles profile
set person_id = person.id,
    updated_at = now()
from public.people person
where person.profile_id = profile.id
  and profile.person_id is null
  and person.deleted_at is null;

analyze public.profiles;
analyze public.people;
