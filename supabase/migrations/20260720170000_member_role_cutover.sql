-- Corte final: reader e guardian deixam de existir como papéis de acesso.

update auth.users auth_user
set raw_user_meta_data = jsonb_set(
  coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
  '{role}',
  '"member"'::jsonb,
  true
)
from public.profiles profile
where profile.auth_user_id = auth_user.id
  and profile.role in ('reader', 'guardian');

update public.people
set access_profile = 'member', updated_at = now()
where access_profile in ('reader', 'guardian');

update public.profiles
set role = 'member', updated_at = now()
where role in ('reader', 'guardian');

alter table public.profiles alter column role set default 'member';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (
  role in (
    'superadmin', 'admin', 'pastor', 'ministry_leader', 'cell_supervisor',
    'cell_leader', 'communication', 'finance', 'volunteer', 'member'
  )
);

analyze public.profiles;
analyze public.people;
