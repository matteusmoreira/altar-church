-- Only the server may reserve or reconcile account creation.
create table public.automation_registrations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null,
 run_id uuid not null, node_id text not null,
 email text not null, phone text not null, full_name text not null, congregation_id uuid not null,
 person_id uuid, profile_id uuid, auth_user_id uuid,
 status text not null default 'reserved' check(status in ('reserved','creating','auth_created','completed','failed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(run_id,node_id),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id) on delete cascade
);
create unique index automation_registration_email_pending on public.automation_registrations(email) where status in ('reserved','creating','auth_created');
create unique index automation_registration_phone_pending on public.automation_registrations(phone) where status in ('reserved','creating','auth_created');
alter table public.automation_registrations enable row level security;
revoke all on public.automation_registrations from public,anon,authenticated;
grant all on public.automation_registrations to service_role;
