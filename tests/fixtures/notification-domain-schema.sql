-- Isolated schema fixture, without production data. Snapshot 2026-10-09.
create table public.volunteer_department_memberships (
  id uuid primary key default gen_random_uuid(), company_id uuid, department_id uuid,
  volunteer_id uuid, role_id uuid, role_name text, is_active boolean default true,
  created_at timestamptz default now(),updated_at timestamptz default now()
);
create table public.app_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  original_name text,
  storage_path text,
  mime_type text,
  is_active boolean default true,
  deleted_at timestamptz
);
create table public.ministry_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  ministry_id uuid,
  title text,
  description text,
  category text,
  external_url text,
  file_id uuid,
  visibility text,
  sort_order integer default 0,
  deleted_at timestamptz
);
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  title text,
  content text,
  author_id uuid,
  author_name text default ''::text,
  priority text default 'medium'::text,
  published bool default false,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  actor_profile_id uuid,
  actor_auth_user_id uuid,
  action text,
  entity_table text,
  entity_id text,
  metadata jsonb default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

create table public.automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  run_id uuid,
  node_id text,
  instance_id uuid,
  chat_id text,
  status text default 'pending'::text,
  provider_id text,
  message jsonb,
  receipts jsonb default '{}'::jsonb,
  last_error text,
  attempts int4 default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  flow_id uuid,
  version_id uuid,
  person_id uuid,
  event_key text,
  node_id text,
  context jsonb default '{}'::jsonb,
  status text default 'ready'::text,
  due_at timestamptz default now(),
  lease_until timestamptz,
  lease_token uuid,
  wait_kind text,
  waiting_node_id text,
  wait_started_at timestamptz,
  last_error text,
  ancestry uuid[] default '{}'::uuid[],
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  history_cleared_at timestamptz
);

create table public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  run_id uuid,
  node_id text,
  person_id uuid,
  responsible_id uuid,
  title text,
  notes text default ''::text,
  status text default 'open'::text,
  due_at timestamptz,
  kind text default 'task'::text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.cell_notice_targets (
  notice_id uuid,
  group_id uuid,
  company_id uuid,
  created_at timestamptz default now()
);

create table public.cell_notices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  title text,
  content text,
  audience text default 'selected'::text,
  published_at timestamptz default now(),
  is_active bool default true,
  author_profile_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.cell_prayer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  group_id uuid,
  author_profile_id uuid,
  author_person_id uuid,
  message text,
  status text default 'open'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.cell_visit_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  group_id uuid,
  person_id uuid,
  full_name text,
  phone text,
  neighborhood text default ''::text,
  notes text default ''::text,
  status text default 'pending'::text,
  crm_card_id uuid,
  follow_up_task_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  contacted_at timestamptz,
  accepted_at timestamptz,
  archived_at timestamptz
);

create table public.cell_whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  request_id uuid,
  group_id uuid,
  recipient text,
  recipient_name text default ''::text,
  recipient_role text default 'leader'::text,
  uazapi_instance_id uuid,
  message_type text,
  message_snapshot jsonb default '{}'::jsonb,
  status text default 'pending'::text,
  attempts int4 default 0,
  last_error text,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  name text,
  slug text,
  responsible_name text default ''::text,
  address text default ''::text,
  city text default ''::text,
  state text default ''::text,
  phone text default ''::text,
  email text default ''::text,
  plan_id uuid,
  status text default 'active'::text,
  active bool default true,
  member_count int4 default 0,
  user_count int4 default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.event_guest_registrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  event_id uuid,
  person_id uuid,
  confirmation_token uuid default gen_random_uuid(),
  full_name text,
  email text default ''::text,
  phone text default ''::text,
  consent_at timestamptz,
  status text default 'going'::text,
  checked_in_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  title text,
  description text default ''::text,
  type text default 'service'::text,
  starts_at timestamptz,
  ends_at timestamptz,
  location text default ''::text,
  banner_url text default ''::text,
  attendance_count int4 default 0,
  max_capacity int4 default 0,
  registration_enabled bool default false,
  is_public bool default true,
  is_online bool default false,
  online_link text default ''::text,
  status text default 'published'::text,
  recurring bool default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  volunteer_template_id uuid,
  volunteer_schedule_published_at timestamptz,
  programming_id uuid,
  ministry_id uuid,
  public_token uuid default gen_random_uuid(),
  registration_form_id uuid,
  slug text,
  public_slug text
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  amount numeric,
  category text default ''::text,
  subcategory text default ''::text,
  paid_to text default 'supplier'::text,
  paid_to_name text default ''::text,
  description text,
  cost_center text default ''::text,
  bank_account text default ''::text,
  payment_method text default ''::text,
  due_date date,
  payment_date date default CURRENT_DATE,
  paid bool default true,
  notes text default ''::text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  receipt_file_id uuid
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  form_id uuid,
  crm_card_id uuid,
  person_id uuid,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table public.form_whatsapp_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  form_id uuid,
  submission_id uuid,
  person_id uuid,
  uazapi_instance_id uuid,
  recipient text default ''::text,
  recipient_name text default ''::text,
  message_type text,
  message_snapshot jsonb default '{}'::jsonb,
  status text default 'pending'::text,
  attempts int4 default 0,
  next_attempt_at timestamptz default now(),
  locked_at timestamptz,
  last_error text,
  response_status int4,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  delivery_key text
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  group_id uuid,
  person_id uuid,
  role text default 'member'::text,
  status text default 'active'::text,
  joined_at date default CURRENT_DATE,
  left_at date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  category_id uuid,
  congregation_id uuid,
  name text,
  description text default ''::text,
  type text default 'cell'::text,
  leader_person_id uuid,
  co_leader_person_id uuid,
  coordinator_person_id uuid,
  meeting_day text default ''::text,
  meeting_time time,
  meeting_location text default ''::text,
  neighborhood text default ''::text,
  city text default ''::text,
  max_capacity int4 default 0,
  min_age int4,
  max_age int4,
  accepts_requests bool default true,
  is_active bool default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  postal_code text default ''::text,
  address_number text default ''::text,
  address_complement text default ''::text,
  state text default ''::text,
  ministry_id uuid,
  latitude float8,
  longitude float8,
  is_address_public bool default true,
  cell_photo_url text,
  is_leader_whatsapp_public bool default true,
  custom_whatsapp_message bool default false,
  whatsapp_message jsonb default '{}'::jsonb,
  automation_whatsapp_chat_id text
);

create table public.integration_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  endpoint_id uuid,
  event_type text,
  event_key text,
  payload jsonb default '{}'::jsonb,
  status text default 'pending'::text,
  attempts int4 default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  response_status int4,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.kid_attendances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  session_id uuid,
  session_classroom_id uuid,
  classroom_name text default ''::text,
  kid_id uuid,
  status text default 'checked_in'::text,
  checked_in_at timestamptz default now(),
  checked_in_by uuid,
  checkout_requested_at timestamptz,
  checkout_requested_by uuid,
  checked_out_at timestamptz,
  checked_out_by uuid,
  room_override_reason text,
  notes text default ''::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  child_label_revision_id uuid,
  guardian_label_revision_id uuid
);

create table public.kid_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  conversation_id uuid,
  kid_id uuid,
  sender_profile_id uuid,
  sender_kind text,
  body text,
  created_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.kid_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  guardian_person_id uuid,
  kid_id uuid,
  status text default 'open'::text,
  staff_read_at timestamptz,
  guardian_read_at timestamptz,
  last_message_at timestamptz default now(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.kid_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  message_id uuid,
  channel text,
  recipient text,
  subject text default ''::text,
  body text,
  idempotency_key text,
  status text default 'pending'::text,
  provider_id text,
  attempts int4 default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  fallback_email text
);

create table public.kid_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  session_id uuid,
  session_classroom_id uuid,
  kid_id uuid,
  severity text default 'info'::text,
  title text,
  description text default ''::text,
  reported_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.kid_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  congregation_id uuid,
  event_id uuid,
  title text,
  status text default 'draft'::text,
  starts_at timestamptz,
  ends_at timestamptz,
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.kid_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  congregation_id uuid,
  require_checkout_pin bool default true,
  pin_rotation_minutes int4 default 30,
  allow_capacity_override bool default true,
  label_paper text default 'thermal_62x40'::text,
  label_show_qr bool default true,
  auto_print bool default true,
  visitor_form_enabled bool default true,
  required_consent_types text[] default ARRAY['data_processing'::text, 'emergency_care'::text],
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  ministry_id uuid
);

create table public.kid_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  session_id uuid,
  session_classroom_id uuid,
  profile_id uuid,
  assignment_role text default 'teacher'::text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.member_event_rsvps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  event_id uuid,
  person_id uuid,
  status text default 'going'::text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.ministries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  name text,
  description text default ''::text,
  contact text default ''::text,
  leader_person_id uuid,
  is_active bool default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  ministry_type text default 'other'::text,
  mission text default ''::text,
  target_audience text default ''::text,
  meeting_day int2,
  meeting_time time,
  meeting_location text default ''::text,
  image_file_id uuid,
  public_join_enabled bool default true,
  slug text
);

create table public.ministry_chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  ministry_id uuid,
  sender_profile_id uuid,
  client_id uuid,
  body text default ''::text,
  reply_to_id uuid,
  created_at timestamptz default date_trunc('milliseconds'::text, clock_timestamp()),
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid
);

create table public.ministry_chat_reads (
  company_id uuid,
  ministry_id uuid,
  profile_id uuid,
  last_read_at timestamptz,
  last_read_id uuid,
  muted bool default false,
  push_enabled bool default false
);

create table public.ministry_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  ministry_id uuid,
  person_id uuid,
  role text default 'member'::text,
  status text default 'pending'::text,
  requested_by uuid,
  reviewed_by uuid,
  requested_at timestamptz default now(),
  reviewed_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  left_at timestamptz
);

create table public.notification_channel_preferences (
  company_id uuid,
  person_id uuid,
  channel text,
  opted_out bool default false,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid,
  company_id uuid,
  person_id uuid,
  channel text,
  recipient text,
  recipient_name text default ''::text,
  status text default 'pending'::text,
  attempts int4 default 0,
  next_attempt_at timestamptz default now(),
  locked_at timestamptz,
  last_error text,
  response_status int4,
  provider_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  delivery_key text,
  guest_registration_id uuid
);

create table public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  person_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  user_agent text default ''::text,
  is_active bool default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  profile_id uuid
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  congregation_id uuid,
  first_name text,
  last_name text default ''::text,
  full_name text,
  email text,
  phone text default ''::text,
  document text,
  birth_date date,
  gender text,
  photo_file_id uuid,
  address text default ''::text,
  city text default ''::text,
  state text default ''::text,
  country text default 'Brasil'::text,
  access_profile text,
  status text default 'active'::text,
  person_type text default 'member'::text,
  journey_status text default ''::text,
  baptized bool default false,
  email_validated bool default false,
  internal_notes text default ''::text,
  is_active bool default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  profile_id uuid,
  postal_code text default ''::text,
  address_number text default ''::text,
  address_complement text default ''::text,
  neighborhood text default ''::text,
  baptism_date date,
  slug text
);

create table public.person_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  person_id uuid,
  responsible_profile_id uuid,
  crm_card_id uuid,
  title text,
  notes text default ''::text,
  due_at timestamptz,
  priority text default 'normal'::text,
  status text default 'open'::text,
  origin text default 'manual'::text,
  source_key text,
  completed_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  ministry_id uuid,
  next_action text
);

create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  name text,
  city text default ''::text,
  state text default ''::text,
  country text default 'Brasil'::text,
  prayer_reason text default 'Pessoal'::text,
  message text,
  receive_visit bool default false,
  receive_call bool default false,
  publish_on_wall bool default true,
  status text default 'open'::text,
  is_active bool default true,
  user_id uuid,
  user_name text default ''::text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text,
  auth_user_id uuid,
  company_id uuid,
  name text,
  email text,
  role text default 'member'::text,
  active bool default true,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  person_id uuid,
  login_phone text,
  deleted_at timestamptz,
  roles text[]
);

create table public.revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  amount numeric,
  category text default ''::text,
  subcategory text default ''::text,
  received_from text default 'person'::text,
  received_from_name text default ''::text,
  description text,
  cost_center text default ''::text,
  bank_account text default ''::text,
  payment_method text default ''::text,
  due_date date,
  payment_date date default CURRENT_DATE,
  received bool default true,
  notes text default ''::text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  receipt_file_id uuid
);

create table public.volunteer_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  shift_id uuid,
  volunteer_id uuid,
  status text default 'assigned'::text,
  checked_in_at timestamptz,
  checkin_source text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  score int4,
  score_reasons jsonb default '[]'::jsonb,
  is_locked bool default false,
  notified_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  checked_out_at timestamptz,
  checkout_source text,
  no_show_marked_at timestamptz
);

create table public.volunteer_delivery_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  volunteer_id uuid,
  feed_post_id uuid,
  assignment_id uuid,
  channel text,
  recipient text default ''::text,
  subject text default ''::text,
  content text,
  status text default 'pending'::text,
  provider_id text,
  attempts int4 default 0,
  next_attempt_at timestamptz default now(),
  last_error text,
  locked_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  recognition_id uuid,
  event_kind text default 'schedule'::text,
  notification_key text,
  payload jsonb default '{}'::jsonb,
  chat_message_id uuid,
  target_profile_id uuid
);

create table public.volunteer_department_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  department_id uuid,
  profile_id uuid,
  access_role text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.volunteer_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  ministry_id uuid,
  manager_profile_id uuid,
  name text,
  description text default ''::text,
  is_active bool default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table public.volunteer_event_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  event_id uuid,
  department_id uuid,
  role_id uuid,
  role_name text,
  required_volunteers int4 default 1,
  instructions text default ''::text,
  sort_order int4 default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.volunteer_notification_preferences (
  volunteer_id uuid,
  company_id uuid,
  schedule_enabled bool default true,
  reminder_enabled bool default true,
  swap_enabled bool default true,
  chat_enabled bool default true,
  feed_enabled bool default true,
  recognition_enabled bool default true,
  push_enabled bool default false,
  whatsapp_enabled bool default false,
  email_enabled bool default false,
  updated_at timestamptz default now()
);

create table public.volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  person_id uuid,
  registration_status text default 'pending'::text,
  whatsapp_enabled bool default false,
  email_enabled bool default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  desired_services_per_month int4 default 2,
  max_services_per_month int4 default 4,
  minimum_rest_hours int4 default 12,
  validated_at timestamptz,
  validated_by uuid
);

create table public.volunteer_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  month date,
  status text default 'draft'::text,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.volunteer_shift_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  shift_id uuid,
  status text default 'open'::text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.volunteer_shift_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  conversation_id uuid,
  sender_profile_id uuid,
  body text,
  created_at timestamptz default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.volunteer_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  schedule_id uuid,
  event_id uuid,
  template_slot_id uuid,
  department_id uuid,
  role_name text,
  required_volunteers int4 default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  checkin_opens_at timestamptz,
  checkin_closes_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  role_id uuid,
  instructions text default ''::text,
  event_position_id uuid
);

create table public.volunteer_swap_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  assignment_id uuid,
  requested_by_volunteer_id uuid,
  replacement_volunteer_id uuid,
  status text default 'open'::text,
  reason text default ''::text,
  replacement_responded_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
