update public.profiles p
set auth_user_id = u.id,
    updated_at = now()
from auth.users u
where p.auth_user_id is null
  and lower(p.email) = lower(u.email);

create or replace function public.link_profile_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set auth_user_id = new.id,
      updated_at = now()
  where auth_user_id is null
    and lower(email) = lower(new.email);

  return new;
end;
$$;

revoke all on function public.link_profile_to_auth_user() from public;

drop trigger if exists link_profile_to_auth_user on auth.users;
create trigger link_profile_to_auth_user
after insert or update of email on auth.users
for each row execute function public.link_profile_to_auth_user();
