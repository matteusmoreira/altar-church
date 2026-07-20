-- Fase compatível: adiciona o papel novo sem converter contas existentes.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role in (
    'superadmin', 'admin', 'pastor', 'ministry_leader', 'cell_supervisor',
    'cell_leader', 'communication', 'finance', 'volunteer', 'reader', 'guardian', 'member'
  )
);

create table if not exists public.ministry_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'pending',
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministry_memberships_role_check check (role in ('member', 'leader')),
  constraint ministry_memberships_status_check check (status in ('pending', 'active', 'rejected', 'inactive')),
  constraint ministry_memberships_unique unique (ministry_id, person_id)
);

create index if not exists ministry_memberships_company_status_idx
  on public.ministry_memberships(company_id, status, updated_at desc);
create index if not exists ministry_memberships_person_status_idx
  on public.ministry_memberships(person_id, status, updated_at desc);

drop trigger if exists ministry_memberships_set_updated_at on public.ministry_memberships;
create trigger ministry_memberships_set_updated_at
before update on public.ministry_memberships
for each row execute function public.set_updated_at();

insert into public.ministry_memberships (
  company_id, ministry_id, person_id, role, status, joined_at
)
select ministry.company_id, ministry.id, ministry.leader_person_id, 'leader', 'active', now()
from public.ministries ministry
where ministry.leader_person_id is not null and ministry.deleted_at is null
on conflict (ministry_id, person_id) do update
set role = 'leader', status = 'active',
    joined_at = coalesce(public.ministry_memberships.joined_at, now());

alter table public.ministry_memberships enable row level security;

drop policy if exists "Ministry memberships scoped read" on public.ministry_memberships;
create policy "Ministry memberships scoped read"
on public.ministry_memberships for select to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    left join public.people person on person.profile_id = profile.id and person.deleted_at is null
    left join public.ministries ministry on ministry.id = ministry_memberships.ministry_id
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        profile.role = 'superadmin'
        or (profile.company_id = ministry_memberships.company_id and profile.role in ('admin', 'pastor'))
        or person.id = ministry_memberships.person_id
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role = 'ministry_leader'
          and ministry.leader_person_id = coalesce(profile.person_id, person.id)
        )
      )
  )
);

drop policy if exists "Members request ministry participation" on public.ministry_memberships;
create policy "Members request ministry participation"
on public.ministry_memberships for insert to authenticated
with check (
  status = 'pending' and role = 'member'
  and exists (
    select 1
    from public.profiles profile
    join public.people person on person.profile_id = profile.id and person.deleted_at is null
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and profile.role = 'member'
      and profile.company_id = ministry_memberships.company_id
      and person.id = ministry_memberships.person_id
      and profile.id = ministry_memberships.requested_by
  )
);

drop policy if exists "Ministry memberships scoped update" on public.ministry_memberships;
create policy "Ministry memberships scoped update"
on public.ministry_memberships for update to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    left join public.people person on person.profile_id = profile.id and person.deleted_at is null
    left join public.ministries ministry on ministry.id = ministry_memberships.ministry_id
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        (person.id = ministry_memberships.person_id and ministry_memberships.status = 'pending')
        or profile.role = 'superadmin'
        or (profile.company_id = ministry_memberships.company_id and profile.role in ('admin', 'pastor'))
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role = 'ministry_leader'
          and ministry.leader_person_id = coalesce(profile.person_id, person.id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.profiles profile
    left join public.people person on person.profile_id = profile.id and person.deleted_at is null
    left join public.ministries ministry on ministry.id = ministry_memberships.ministry_id
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        (
          profile.role = 'member'
          and profile.company_id = ministry_memberships.company_id
          and person.id = ministry_memberships.person_id
          and ministry_memberships.role = 'member'
          and ministry_memberships.status = 'inactive'
        )
        or profile.role = 'superadmin'
        or (profile.company_id = ministry_memberships.company_id and profile.role in ('admin', 'pastor'))
        or (
          profile.company_id = ministry_memberships.company_id
          and profile.role = 'ministry_leader'
          and ministry.leader_person_id = person.id
        )
      )
  )
);

grant select, insert, update on public.ministry_memberships to authenticated;
analyze public.profiles;
analyze public.ministry_memberships;
