-- Evolution of Member Journeys, Steps, and Enrollments

alter table public.member_journeys
  add column if not exists is_auto_enroll boolean not null default false,
  add column if not exists auto_enroll_type text default null;

alter table public.member_journey_steps
  add column if not exists estimated_days integer not null default 7;

create table if not exists public.person_journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  journey_id uuid not null references public.member_journeys(id) on delete cascade,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_journey_enrollments_status_check check (status in ('in_progress', 'completed', 'dropped')),
  constraint person_journey_enrollments_unique unique (person_id, journey_id)
);

create index if not exists person_journey_enrollments_person_idx
  on public.person_journey_enrollments(company_id, person_id, status);

create index if not exists person_journey_enrollments_journey_idx
  on public.person_journey_enrollments(company_id, journey_id, status);

alter table public.person_journey_enrollments enable row level security;

drop policy if exists "Company members read rows" on public.person_journey_enrollments;
create policy "Company members read rows" on public.person_journey_enrollments
  for select to authenticated
  using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Company members insert rows" on public.person_journey_enrollments;
create policy "Company members insert rows" on public.person_journey_enrollments
  for insert to authenticated
  with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Company members update rows" on public.person_journey_enrollments;
create policy "Company members update rows" on public.person_journey_enrollments
  for update to authenticated
  using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
  with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Company members delete rows" on public.person_journey_enrollments;
create policy "Company members delete rows" on public.person_journey_enrollments
  for delete to authenticated
  using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update, delete on public.person_journey_enrollments to authenticated;

-- Backfill enrollments for any person already with progress recorded
insert into public.person_journey_enrollments (company_id, person_id, journey_id, status, started_at)
select distinct pjp.company_id, pjp.person_id, pjp.journey_id, 'in_progress', coalesce(min(pjp.created_at), now())
from public.person_journey_progress pjp
where not exists (
  select 1 from public.person_journey_enrollments existing
  where existing.company_id = pjp.company_id
    and existing.person_id = pjp.person_id
    and existing.journey_id = pjp.journey_id
)
group by pjp.company_id, pjp.person_id, pjp.journey_id
on conflict do nothing;

analyze public.member_journeys;
analyze public.member_journey_steps;
analyze public.person_journey_enrollments;
