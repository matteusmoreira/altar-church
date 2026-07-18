-- kids module: cadastro infantil, responsáveis, saúde essencial cifrada, consentimentos,
-- salas, sessões, presenças, credenciais de retirada, trilha de segurança e outbox de mensagens.
-- Migration aditiva: não altera registros existentes. Ativação do módulo é manual (superadmin).

-- Papel "guardian" (responsável familiar): conta isolada, nunca acessa o dashboard administrativo.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in (
    'superadmin','admin','pastor','ministry_leader','cell_supervisor',
    'cell_leader','communication','finance','volunteer','reader','guardian'
  ));

-- ---------------------------------------------------------------------------
-- Tabelas de cadastro
-- ---------------------------------------------------------------------------

-- Criança: vínculo 1:1 com people; dados específicos do domínio Kids ficam aqui.
create table if not exists public.kid_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active',
  is_visitor boolean not null default false,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_profiles_status_check check (status in ('active', 'inactive'))
);

create unique index if not exists kid_profiles_person_active_unique_idx
  on public.kid_profiles(person_id)
  where deleted_at is null;
create index if not exists kid_profiles_company_status_idx
  on public.kid_profiles(company_id, status)
  where deleted_at is null;
create index if not exists kid_profiles_company_created_at_idx
  on public.kid_profiles(company_id, created_at desc)
  where deleted_at is null;

-- Responsável: pessoa (people) com parentesco, autorizações e conta de acesso opcional.
create table if not exists public.kid_guardians (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kid_id uuid not null references public.kid_profiles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  relationship text not null default 'guardian',
  is_primary boolean not null default false,
  can_checkin boolean not null default true,
  can_checkout boolean not null default true,
  is_emergency_contact boolean not null default true,
  whatsapp_enabled boolean not null default true,
  email_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_guardians_relationship_check check (relationship in ('father', 'mother', 'guardian', 'grandparent', 'relative', 'other'))
);

create unique index if not exists kid_guardians_kid_person_unique_idx
  on public.kid_guardians(kid_id, person_id)
  where deleted_at is null;
create index if not exists kid_guardians_kid_id_idx
  on public.kid_guardians(kid_id)
  where deleted_at is null;
create index if not exists kid_guardians_person_id_idx
  on public.kid_guardians(person_id)
  where deleted_at is null;
create index if not exists kid_guardians_profile_id_idx
  on public.kid_guardians(profile_id)
  where profile_id is not null and deleted_at is null;
create index if not exists kid_guardians_company_id_idx
  on public.kid_guardians(company_id, created_at desc)
  where deleted_at is null;

-- Saúde essencial: indicadores consultáveis em claro; detalhes sempre cifrados (AES-GCM, camada de aplicação).
create table if not exists public.kid_health_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kid_id uuid not null references public.kid_profiles(id) on delete cascade,
  has_allergy boolean not null default false,
  has_dietary_restriction boolean not null default false,
  has_medication boolean not null default false,
  has_special_needs boolean not null default false,
  details_encrypted text not null default '',
  details_updated_at timestamptz,
  details_updated_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists kid_health_profiles_kid_unique_idx
  on public.kid_health_profiles(kid_id)
  where deleted_at is null;
create index if not exists kid_health_profiles_company_alerts_idx
  on public.kid_health_profiles(company_id, has_allergy, has_medication, has_special_needs)
  where deleted_at is null;

-- Consentimentos versionados: aceite/revogação com origem e evidência.
create table if not exists public.kid_consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kid_id uuid not null references public.kid_profiles(id) on delete cascade,
  consent_type text not null,
  version text not null,
  status text not null,
  source text not null default 'reception',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_consents_type_check check (consent_type in ('data_processing', 'image_use', 'emergency_care', 'communication')),
  constraint kid_consents_status_check check (status in ('granted', 'revoked')),
  constraint kid_consents_source_check check (source in ('portal', 'reception', 'import')),
  constraint kid_consents_version_check check (char_length(btrim(version)) between 1 and 40)
);

-- Um consentimento vigente por tipo; versões novas revogam a anterior em transação.
create unique index if not exists kid_consents_active_type_unique_idx
  on public.kid_consents(kid_id, consent_type)
  where status = 'granted';
create index if not exists kid_consents_kid_id_idx
  on public.kid_consents(kid_id, consent_type, status);
create index if not exists kid_consents_company_id_idx
  on public.kid_consents(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Salas e regras
-- ---------------------------------------------------------------------------

create table if not exists public.kid_classrooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete set null,
  name text not null,
  min_age_months integer not null default 0,
  max_age_months integer not null default 216,
  capacity integer not null default 10,
  location text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_classrooms_name_check check (char_length(btrim(name)) between 2 and 120),
  constraint kid_classrooms_age_range_check check (min_age_months >= 0 and max_age_months >= min_age_months),
  constraint kid_classrooms_capacity_check check (capacity > 0)
);

create index if not exists kid_classrooms_company_congregation_idx
  on public.kid_classrooms(company_id, congregation_id)
  where deleted_at is null;
create index if not exists kid_classrooms_company_active_idx
  on public.kid_classrooms(company_id, is_active)
  where deleted_at is null;

-- Regra de sugestão de sala: congregação + faixa etária + horário, com prioridade.
create table if not exists public.kid_classroom_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  classroom_id uuid not null references public.kid_classrooms(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete set null,
  weekday integer,
  start_time time,
  end_time time,
  min_age_months integer not null default 0,
  max_age_months integer not null default 216,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_classroom_rules_weekday_check check (weekday between 0 and 6),
  constraint kid_classroom_rules_age_range_check check (min_age_months >= 0 and max_age_months >= min_age_months),
  constraint kid_classroom_rules_time_range_check check (start_time is null or end_time is null or start_time < end_time)
);

create index if not exists kid_classroom_rules_classroom_idx
  on public.kid_classroom_rules(classroom_id)
  where deleted_at is null;
create index if not exists kid_classroom_rules_company_congregation_idx
  on public.kid_classroom_rules(company_id, congregation_id, is_active, priority)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Sessões, escalas e presenças
-- ---------------------------------------------------------------------------

create table if not exists public.kid_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  status text not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  opened_at timestamptz,
  opened_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_sessions_status_check check (status in ('draft', 'open', 'closed', 'cancelled')),
  constraint kid_sessions_title_check check (char_length(btrim(title)) between 2 and 160),
  constraint kid_sessions_period_check check (ends_at is null or ends_at > starts_at)
);

create index if not exists kid_sessions_company_status_idx
  on public.kid_sessions(company_id, status, starts_at desc)
  where deleted_at is null;
create index if not exists kid_sessions_company_congregation_idx
  on public.kid_sessions(company_id, congregation_id, starts_at desc)
  where deleted_at is null;
create index if not exists kid_sessions_event_id_idx
  on public.kid_sessions(event_id)
  where event_id is not null and deleted_at is null;

create table if not exists public.kid_session_classrooms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.kid_sessions(id) on delete cascade,
  classroom_id uuid not null references public.kid_classrooms(id) on delete cascade,
  capacity_override integer,
  is_open boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_session_classrooms_session_classroom_unique unique (session_id, classroom_id),
  constraint kid_session_classrooms_capacity_check check (capacity_override is null or capacity_override > 0)
);

create index if not exists kid_session_classrooms_session_idx
  on public.kid_session_classrooms(session_id, sort_order);
create index if not exists kid_session_classrooms_classroom_idx
  on public.kid_session_classrooms(classroom_id);

create table if not exists public.kid_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.kid_sessions(id) on delete cascade,
  session_classroom_id uuid references public.kid_session_classrooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assignment_role text not null default 'teacher',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_staff_assignments_role_check check (assignment_role in ('leader', 'teacher', 'helper', 'reception'))
);

create unique index if not exists kid_staff_assignments_unique_idx
  on public.kid_staff_assignments(session_id, coalesce(session_classroom_id, '00000000-0000-0000-0000-000000000000'::uuid), profile_id);
create index if not exists kid_staff_assignments_profile_idx
  on public.kid_staff_assignments(profile_id, session_id);
create index if not exists kid_staff_assignments_classroom_idx
  on public.kid_staff_assignments(session_classroom_id)
  where session_classroom_id is not null;

create table if not exists public.kid_attendances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.kid_sessions(id) on delete cascade,
  session_classroom_id uuid references public.kid_session_classrooms(id) on delete set null,
  classroom_name text not null default '',
  kid_id uuid not null references public.kid_profiles(id) on delete cascade,
  status text not null default 'checked_in',
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references public.profiles(id) on delete set null,
  checkout_requested_at timestamptz,
  checkout_requested_by uuid references public.profiles(id) on delete set null,
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles(id) on delete set null,
  room_override_reason text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_attendances_status_check check (status in ('checked_in', 'checkout_requested', 'checked_out'))
);

-- Um check-in ativo por criança por sessão, mesmo sob concorrência.
create unique index if not exists kid_attendances_active_unique_idx
  on public.kid_attendances(session_id, kid_id)
  where status in ('checked_in', 'checkout_requested');
create index if not exists kid_attendances_session_status_idx
  on public.kid_attendances(session_id, status);
create index if not exists kid_attendances_kid_status_idx
  on public.kid_attendances(kid_id, status);
create index if not exists kid_attendances_company_session_idx
  on public.kid_attendances(company_id, session_id, status);
create index if not exists kid_attendances_classroom_idx
  on public.kid_attendances(session_classroom_id, status)
  where session_classroom_id is not null;

-- Credencial de retirada: token/PIN somente em hash; expira e é revogada no checkout.
create table if not exists public.kid_pickup_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  attendance_id uuid not null references public.kid_attendances(id) on delete cascade,
  kid_id uuid not null references public.kid_profiles(id) on delete cascade,
  token_hash text not null,
  pin_hash text not null,
  pin_expires_at timestamptz not null,
  status text not null default 'active',
  rotation_count integer not null default 0,
  failed_attempts integer not null default 0,
  locked_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_pickup_credentials_status_check check (status in ('active', 'used', 'revoked', 'expired')),
  constraint kid_pickup_credentials_token_hash_check check (char_length(token_hash) = 64),
  constraint kid_pickup_credentials_pin_hash_check check (char_length(pin_hash) = 64)
);

create unique index if not exists kid_pickup_credentials_active_unique_idx
  on public.kid_pickup_credentials(attendance_id)
  where status = 'active';
create index if not exists kid_pickup_credentials_token_idx
  on public.kid_pickup_credentials(company_id, token_hash);
create index if not exists kid_pickup_credentials_kid_idx
  on public.kid_pickup_credentials(kid_id, status);

-- Trilha operacional e de segurança (append-only; nunca registra PIN/token nem dados clínicos).
create table if not exists public.kid_access_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid references public.kid_sessions(id) on delete set null,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  attendance_id uuid references public.kid_attendances(id) on delete set null,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint kid_access_events_type_check check (event_type in (
    'checkin', 'checkout', 'checkout_denied', 'checkout_override',
    'guardian_called', 'credential_rotated', 'credential_locked', 'room_changed'
  ))
);

create index if not exists kid_access_events_company_created_idx
  on public.kid_access_events(company_id, created_at desc);
create index if not exists kid_access_events_session_idx
  on public.kid_access_events(session_id, created_at desc)
  where session_id is not null;
create index if not exists kid_access_events_kid_idx
  on public.kid_access_events(kid_id, created_at desc)
  where kid_id is not null;

create table if not exists public.kid_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid references public.kid_sessions(id) on delete set null,
  session_classroom_id uuid references public.kid_session_classrooms(id) on delete set null,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  severity text not null default 'info',
  title text not null,
  description text not null default '',
  reported_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_incidents_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint kid_incidents_title_check check (char_length(btrim(title)) between 2 and 200)
);

create index if not exists kid_incidents_company_session_idx
  on public.kid_incidents(company_id, session_id)
  where deleted_at is null;
create index if not exists kid_incidents_kid_idx
  on public.kid_incidents(kid_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Comunicação
-- ---------------------------------------------------------------------------

create table if not exists public.kid_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid references public.kid_sessions(id) on delete set null,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  audience text not null default 'guardian',
  channel text not null,
  subject text not null default '',
  body text not null,
  segment jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_messages_audience_check check (audience in ('guardian', 'classroom', 'segment')),
  constraint kid_messages_channel_check check (channel in ('whatsapp', 'email', 'internal')),
  constraint kid_messages_status_check check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled'))
);

create index if not exists kid_messages_company_status_idx
  on public.kid_messages(company_id, status, created_at desc)
  where deleted_at is null;

create table if not exists public.kid_lesson_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  session_id uuid not null references public.kid_sessions(id) on delete cascade,
  session_classroom_id uuid references public.kid_session_classrooms(id) on delete set null,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  title text not null,
  content text not null default '',
  shared_with_guardians boolean not null default false,
  author_profile_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_lesson_reports_title_check check (char_length(btrim(title)) between 2 and 200)
);

create index if not exists kid_lesson_reports_session_idx
  on public.kid_lesson_reports(session_id)
  where deleted_at is null;
create index if not exists kid_lesson_reports_kid_idx
  on public.kid_lesson_reports(kid_id)
  where kid_id is not null and deleted_at is null;

-- Outbox persistida com idempotência e retry; status 'delivered' só via reconciliação (webhook/polling).
create table if not exists public.kid_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  message_id uuid references public.kid_messages(id) on delete set null,
  channel text not null,
  recipient text not null,
  subject text not null default '',
  body text not null,
  idempotency_key text not null,
  status text not null default 'pending',
  provider_id text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_delivery_outbox_channel_check check (channel in ('whatsapp', 'email')),
  constraint kid_delivery_outbox_status_check check (status in ('pending', 'processing', 'queued', 'sent', 'delivered', 'failed')),
  constraint kid_delivery_outbox_idempotency_unique unique (company_id, idempotency_key)
);

create index if not exists kid_delivery_outbox_work_idx
  on public.kid_delivery_outbox(status, next_attempt_at)
  where status in ('pending', 'failed');
create index if not exists kid_delivery_outbox_message_idx
  on public.kid_delivery_outbox(message_id)
  where message_id is not null;
create index if not exists kid_delivery_outbox_provider_idx
  on public.kid_delivery_outbox(channel, provider_id)
  where provider_id is not null;

-- ---------------------------------------------------------------------------
-- Configurações por empresa/congregação
-- ---------------------------------------------------------------------------

create table if not exists public.kid_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete cascade,
  require_checkout_pin boolean not null default true,
  pin_rotation_minutes integer not null default 30,
  allow_capacity_override boolean not null default true,
  label_paper text not null default 'thermal_62x40',
  label_show_qr boolean not null default true,
  auto_print boolean not null default true,
  visitor_form_enabled boolean not null default true,
  required_consent_types text[] not null default array['data_processing', 'emergency_care'],
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kid_settings_pin_rotation_check check (pin_rotation_minutes between 5 and 240),
  constraint kid_settings_label_paper_check check (label_paper in ('thermal_62x40', 'a4'))
);

create unique index if not exists kid_settings_company_default_unique_idx
  on public.kid_settings(company_id)
  where congregation_id is null;
create unique index if not exists kid_settings_congregation_unique_idx
  on public.kid_settings(company_id, congregation_id)
  where congregation_id is not null;

-- ---------------------------------------------------------------------------
-- Helpers RLS: equipe Kids vs responsável familiar
-- ---------------------------------------------------------------------------

create or replace function public.kids_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = (select auth.uid())
    and p.active = true
  limit 1
$$;

create or replace function public.kids_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.active = true
      and p.role in ('admin', 'pastor', 'ministry_leader', 'volunteer')
  )
$$;

create or replace function public.kids_is_guardian()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = (select auth.uid())
      and p.active = true
      and p.role = 'guardian'
  )
$$;

-- Filhos vinculados à conta do responsável autenticado.
create or replace function public.kids_guardian_kid_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select kg.kid_id
  from public.kid_guardians kg
  where kg.profile_id = (select public.kids_current_profile_id())
    and kg.deleted_at is null
$$;

revoke all on function public.kids_current_profile_id() from public;
revoke all on function public.kids_is_staff() from public;
revoke all on function public.kids_is_guardian() from public;
revoke all on function public.kids_guardian_kid_ids() from public;
grant execute on function public.kids_current_profile_id() to authenticated;
grant execute on function public.kids_is_staff() to authenticated;
grant execute on function public.kids_is_guardian() to authenticated;
grant execute on function public.kids_guardian_kid_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS, triggers e grants
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
  staff_tables text[] := array[
    'kid_profiles',
    'kid_guardians',
    'kid_health_profiles',
    'kid_consents',
    'kid_classrooms',
    'kid_classroom_rules',
    'kid_sessions',
    'kid_session_classrooms',
    'kid_staff_assignments',
    'kid_attendances',
    'kid_pickup_credentials',
    'kid_access_events',
    'kid_incidents',
    'kid_messages',
    'kid_lesson_reports',
    'kid_delivery_outbox',
    'kid_settings'
  ];
  updated_at_tables text[] := array[
    'kid_profiles',
    'kid_guardians',
    'kid_health_profiles',
    'kid_consents',
    'kid_classrooms',
    'kid_classroom_rules',
    'kid_sessions',
    'kid_session_classrooms',
    'kid_staff_assignments',
    'kid_attendances',
    'kid_pickup_credentials',
    'kid_incidents',
    'kid_messages',
    'kid_lesson_reports',
    'kid_delivery_outbox',
    'kid_settings'
  ];
  -- Leitura familiar (select) limitada às crianças vinculadas à conta guardian.
  guardian_linked_tables text[] := array[
    'kid_health_profiles',
    'kid_consents',
    'kid_attendances',
    'kid_pickup_credentials'
  ];
begin
  foreach table_name in array staff_tables loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;

  foreach table_name in array updated_at_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;

  -- Acesso de equipe (tenant + papel operacional). Responsável NÃO entra por aqui.
  foreach table_name in array staff_tables loop
    execute format('drop policy if exists %I on public.%I', table_name || ' staff access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff()))) with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff())))',
      table_name || ' staff access',
      table_name
    );
  end loop;

  -- Leitura do responsável: somente linhas das próprias crianças (via kid_id).
  foreach table_name in array guardian_linked_tables loop
    execute format('drop policy if exists %I on public.%I', table_name || ' guardian read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.kids_is_guardian()) and kid_id in (select public.kids_guardian_kid_ids()))',
      table_name || ' guardian read',
      table_name
    );
  end loop;
end $$;

-- kid_profiles: responsável lê apenas as próprias crianças (aqui a coluna é id).
drop policy if exists "kid_profiles guardian read" on public.kid_profiles;
create policy "kid_profiles guardian read"
on public.kid_profiles
for select
to authenticated
using (
  (select public.kids_is_guardian())
  and id in (select public.kids_guardian_kid_ids())
);

-- kid_guardians: responsável lê apenas os próprios vínculos (pela conta).
drop policy if exists "kid_guardians guardian read" on public.kid_guardians;
create policy "kid_guardians guardian read"
on public.kid_guardians
for select
to authenticated
using (
  (select public.kids_is_guardian())
  and profile_id = (select public.kids_current_profile_id())
);

-- Salas, sessões e suas junções: responsável pode ler nomes/horários (portal e etiqueta).
do $$
declare
  table_name text;
  guardian_company_read_tables text[] := array[
    'kid_classrooms',
    'kid_classroom_rules',
    'kid_sessions',
    'kid_session_classrooms'
  ];
begin
  foreach table_name in array guardian_company_read_tables loop
    execute format('drop policy if exists %I on public.%I', table_name || ' guardian read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.kids_is_guardian()) and (select public.is_company_member(company_id)))',
      table_name || ' guardian read',
      table_name
    );
  end loop;
end $$;

-- Relatórios de aula: responsável lê apenas os compartilhados e dos próprios filhos.
drop policy if exists "kid_lesson_reports guardian read" on public.kid_lesson_reports;
create policy "kid_lesson_reports guardian read"
on public.kid_lesson_reports
for select
to authenticated
using (
  (select public.kids_is_guardian())
  and shared_with_guardians = true
  and kid_id in (select public.kids_guardian_kid_ids())
);

-- Grants: trilha de segurança é append-only (select + insert).
do $$
declare
  table_name text;
  all_tables text[] := array[
    'kid_profiles',
    'kid_guardians',
    'kid_health_profiles',
    'kid_consents',
    'kid_classrooms',
    'kid_classroom_rules',
    'kid_sessions',
    'kid_session_classrooms',
    'kid_staff_assignments',
    'kid_attendances',
    'kid_pickup_credentials',
    'kid_incidents',
    'kid_messages',
    'kid_lesson_reports',
    'kid_delivery_outbox',
    'kid_settings'
  ];
begin
  foreach table_name in array all_tables loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

grant select, insert on public.kid_access_events to authenticated;

-- ---------------------------------------------------------------------------
-- Registro do módulo: fora de planos e empresas; ativação manual pelo superadmin.
-- ---------------------------------------------------------------------------

insert into public.system_modules (id, label, description, route, menu_group, icon_name, required_permission, sort_order)
values ('kids', 'Kids', 'Check-in infantil, salas, etiquetas e retirada segura.', '/kids', 'Cuidar', 'Baby', 'kids.view', 90)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    route = excluded.route,
    menu_group = excluded.menu_group,
    icon_name = excluded.icon_name,
    required_permission = excluded.required_permission,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();
