-- Link people (pastoral records) to profiles (system login accounts).

alter table public.people
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

create unique index if not exists people_profile_id_unique_idx
  on public.people(profile_id)
  where profile_id is not null and deleted_at is null;

create index if not exists people_company_id_profile_id_idx
  on public.people(company_id, profile_id)
  where deleted_at is null;
