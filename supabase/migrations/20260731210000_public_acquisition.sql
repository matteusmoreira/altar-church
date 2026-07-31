-- Pacote público: calendário, atribuição e conversão auditável por tenant.

create table if not exists public.public_acquisition_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_kind text not null,
  source_kind text not null default 'direct',
  source_label text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_content text not null default '',
  utm_term text not null default '',
  landing_path text not null default '',
  referrer text not null default '',
  session_key text not null default '',
  idempotency_key text,
  form_id uuid references public.forms(id) on delete set null,
  form_submission_id uuid references public.form_submissions(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  crm_card_id uuid references public.crm_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint public_acquisition_kind_check check (event_kind in ('page_view', 'form_submission', 'conversion', 'event_registration')),
  constraint public_acquisition_source_check check (source_kind in ('qr', 'instagram', 'site', 'referral', 'event', 'campaign', 'direct', 'other')),
  constraint public_acquisition_landing_path_length check (char_length(landing_path) <= 500),
  constraint public_acquisition_referrer_length check (char_length(referrer) <= 500)
);

create unique index if not exists public_acquisition_idempotency_idx
  on public.public_acquisition_events(company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists public_acquisition_company_created_idx
  on public.public_acquisition_events(company_id, created_at desc);
create index if not exists public_acquisition_company_source_idx
  on public.public_acquisition_events(company_id, source_kind, event_kind, created_at desc);

alter table public.public_acquisition_events enable row level security;
drop policy if exists public_acquisition_events_company_access on public.public_acquisition_events;
create policy public_acquisition_events_company_access on public.public_acquisition_events
  for select to authenticated
  using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select on public.public_acquisition_events to authenticated;

alter table public.person_follow_up_tasks
  drop constraint if exists person_follow_up_task_origin_check;
alter table public.person_follow_up_tasks
  add constraint person_follow_up_task_origin_check check (origin in (
    'manual', 'public_form', 'new_visitor', 'visitor_without_contact', 'recurring_absence',
    'new_prayer_request', 'without_cell', 'without_portal_access'
  ));

analyze public.public_acquisition_events;
