-- Fase 3: agenda do membro, RSVP concorrente e autoatendimento seguro.

create table if not exists public.member_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_event_rsvp_status_check check (status in ('going', 'waitlisted', 'canceled')),
  constraint member_event_rsvp_unique unique (event_id, person_id)
);

create index if not exists member_event_rsvps_event_status_idx
  on public.member_event_rsvps(company_id, event_id, status, created_at);
create index if not exists member_event_rsvps_person_idx
  on public.member_event_rsvps(company_id, person_id, updated_at desc);

drop trigger if exists member_event_rsvps_set_updated_at on public.member_event_rsvps;
create trigger member_event_rsvps_set_updated_at before update on public.member_event_rsvps
for each row execute function public.set_updated_at();

alter table public.member_event_rsvps enable row level security;
drop policy if exists member_event_rsvps_company_access on public.member_event_rsvps;
create policy member_event_rsvps_company_access on public.member_event_rsvps
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update on public.member_event_rsvps to authenticated;
analyze public.member_event_rsvps;
