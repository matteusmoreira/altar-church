-- Login por WhatsApp e recuperação de senha por OTP, isolados por igreja.

alter table public.profiles
  add column if not exists login_phone text;

alter table public.profiles
  drop constraint if exists profiles_login_phone_format_check;

alter table public.profiles
  add constraint profiles_login_phone_format_check
  check (login_phone is null or login_phone ~ '^[1-9][0-9]9[0-9]{8}$');

-- Aproveita somente telefones móveis inequívocos já vinculados. Duplicados permanecem
-- pendentes para correção pelo próprio usuário, sem escolher uma conta arbitrariamente.
with candidates as (
  select
    profile.id as profile_id,
    regexp_replace(person.phone, '\D', '', 'g') as phone,
    count(*) over (
      partition by regexp_replace(person.phone, '\D', '', 'g')
    ) as phone_uses
  from public.profiles profile
  join public.people person
    on person.company_id = profile.company_id
   and person.deleted_at is null
   and (person.id = profile.person_id or person.profile_id = profile.id)
  where profile.company_id is not null
    and regexp_replace(person.phone, '\D', '', 'g') ~ '^[1-9][0-9]9[0-9]{8}$'
)
update public.profiles profile
set login_phone = candidate.phone,
    updated_at = now()
from candidates candidate
where profile.id = candidate.profile_id
  and candidate.phone_uses = 1
  and profile.login_phone is null;

create unique index if not exists profiles_login_phone_unique_idx
  on public.profiles(login_phone)
  where login_phone is not null;

create table if not exists public.auth_password_reset_challenges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null,
  request_ip_hash text not null,
  delivery_status text not null default 'pending',
  provider_message_id text,
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  invalidated_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint auth_password_reset_code_hash_check check (code_hash ~ '^[a-f0-9]{64}$'),
  constraint auth_password_reset_ip_hash_check check (request_ip_hash ~ '^[a-f0-9]{64}$'),
  constraint auth_password_reset_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed')),
  constraint auth_password_reset_attempt_count_check
    check (attempt_count between 0 and 5),
  constraint auth_password_reset_expiry_check check (expires_at > created_at)
);

create index if not exists auth_password_reset_profile_created_idx
  on public.auth_password_reset_challenges(profile_id, created_at desc);

create index if not exists auth_password_reset_ip_created_idx
  on public.auth_password_reset_challenges(request_ip_hash, created_at desc);

create index if not exists auth_password_reset_expiry_idx
  on public.auth_password_reset_challenges(expires_at)
  where consumed_at is null and invalidated_at is null;

alter table public.auth_password_reset_challenges enable row level security;

revoke all on public.auth_password_reset_challenges from public, anon, authenticated;

comment on column public.profiles.login_phone is
  'Brazilian mobile number (DDD + number) used as the unique WhatsApp login identifier.';

comment on table public.auth_password_reset_challenges is
  'Server-only, tenant-scoped OTP challenges for password recovery. Codes are stored only as HMAC hashes.';
