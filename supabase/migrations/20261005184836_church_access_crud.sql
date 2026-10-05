-- Keep historical references when the church removes a login.
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add constraint profiles_deleted_inactive_check
  check (deleted_at is null or active = false);
