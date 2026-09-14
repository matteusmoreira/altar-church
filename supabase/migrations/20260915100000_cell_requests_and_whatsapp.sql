-- Migração para Solicitações de Células e Disparo de WhatsApp via UAZAPI

-- 1. Campos extras em public.groups para personalização por célula
alter table public.groups
  add column if not exists custom_whatsapp_message boolean not null default false,
  add column if not exists whatsapp_message jsonb not null default '{}'::jsonb;

-- 2. Tabela de configuração geral de WhatsApp das células por igreja
create table if not exists public.cell_whatsapp_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  is_enabled boolean not null default true,
  whatsapp_instance_id uuid references public.uazapi_instances(id) on delete set null,
  send_to_leader boolean not null default true,
  send_to_visitor boolean not null default false,
  leader_message jsonb not null default '{}'::jsonb,
  visitor_message jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists cell_whatsapp_settings_set_updated_at on public.cell_whatsapp_settings;
create trigger cell_whatsapp_settings_set_updated_at
before update on public.cell_whatsapp_settings
for each row execute function public.set_updated_at();

alter table public.cell_whatsapp_settings enable row level security;
drop policy if exists "cell_whatsapp_settings_company_access" on public.cell_whatsapp_settings;
create policy "cell_whatsapp_settings_company_access"
on public.cell_whatsapp_settings
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update on public.cell_whatsapp_settings to authenticated;

-- 3. Tabela de solicitações / pré-cadastros de visitas nas células
create table if not exists public.cell_visit_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  full_name text not null,
  phone text not null,
  neighborhood text not null default '',
  notes text not null default '',
  status text not null default 'pending',
  crm_card_id uuid references public.crm_cards(id) on delete set null,
  follow_up_task_id uuid references public.person_follow_up_tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contacted_at timestamptz,
  accepted_at timestamptz,
  archived_at timestamptz,
  constraint cell_visit_requests_status_check check (status in ('pending', 'contacted', 'accepted', 'archived'))
);

create index if not exists cell_visit_requests_company_status_idx
  on public.cell_visit_requests(company_id, status, created_at desc);

create index if not exists cell_visit_requests_group_idx
  on public.cell_visit_requests(company_id, group_id, created_at desc);

create index if not exists cell_visit_requests_person_idx
  on public.cell_visit_requests(person_id);

drop trigger if exists cell_visit_requests_set_updated_at on public.cell_visit_requests;
create trigger cell_visit_requests_set_updated_at
before update on public.cell_visit_requests
for each row execute function public.set_updated_at();

alter table public.cell_visit_requests enable row level security;
drop policy if exists "cell_visit_requests_company_access" on public.cell_visit_requests;
create policy "cell_visit_requests_company_access"
on public.cell_visit_requests
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update on public.cell_visit_requests to authenticated;

-- 4. Tabela de histórico de disparos de WhatsApp de células
create table if not exists public.cell_whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid references public.cell_visit_requests(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  recipient text not null,
  recipient_name text not null default '',
  recipient_role text not null default 'leader',
  uazapi_instance_id uuid references public.uazapi_instances(id) on delete set null,
  message_type text not null,
  message_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cell_whatsapp_deliveries_role_check check (recipient_role in ('leader', 'visitor')),
  constraint cell_whatsapp_deliveries_status_check check (status in ('pending', 'processing', 'sent', 'failed', 'dead'))
);

create index if not exists cell_whatsapp_deliveries_request_idx
  on public.cell_whatsapp_deliveries(company_id, request_id);

alter table public.cell_whatsapp_deliveries enable row level security;
drop policy if exists "cell_whatsapp_deliveries_company_access" on public.cell_whatsapp_deliveries;
create policy "cell_whatsapp_deliveries_company_access"
on public.cell_whatsapp_deliveries
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update on public.cell_whatsapp_deliveries to authenticated;
