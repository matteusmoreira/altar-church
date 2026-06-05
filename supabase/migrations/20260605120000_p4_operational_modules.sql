create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  type text not null default 'service',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  banner_url text not null default '',
  attendance_count integer not null default 0,
  max_capacity integer not null default 0,
  registration_enabled boolean not null default false,
  is_public boolean not null default true,
  is_online boolean not null default false,
  online_link text not null default '',
  status text not null default 'published',
  recurring boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_type_check check (type in ('service', 'prayer', 'youth', 'children', 'special', 'meeting')),
  constraint events_status_check check (status in ('draft', 'published', 'cancelled')),
  constraint events_capacity_check check (attendance_count >= 0 and max_capacity >= 0)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  person_name text not null,
  event_type text not null default 'service',
  event_ref_id uuid,
  event_ref_name text not null default '',
  occurred_on date not null default current_date,
  occurred_time time,
  status text not null default 'present',
  registered_by uuid references public.profiles(id) on delete set null,
  registered_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint attendance_event_type_check check (event_type in ('service', 'event', 'cell', 'ministry', 'course')),
  constraint attendance_status_check check (status in ('present', 'absent', 'justified'))
);

create table if not exists public.crm_cards (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  person_name text not null,
  person_phone text not null default '',
  person_email text not null default '',
  stage text not null default 'new',
  source text not null default '',
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_to_name text not null default '',
  last_contact date,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint crm_cards_stage_check check (stage in ('new', 'contacted', 'meeting', 'visiting', 'member', 'inactive'))
);

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  city text not null default '',
  state text not null default '',
  country text not null default 'Brasil',
  prayer_reason text not null default 'Pessoal',
  message text not null,
  receive_visit boolean not null default false,
  receive_call boolean not null default false,
  publish_on_wall boolean not null default true,
  status text not null default 'open',
  is_active boolean not null default true,
  user_id uuid references public.profiles(id) on delete set null,
  user_name text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint prayer_requests_status_check check (status in ('open', 'praying', 'answered', 'archived'))
);

create table if not exists public.reading_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  cover_image_url text not null default '',
  objectives jsonb not null default '[]'::jsonb,
  period text not null default '',
  target_audience text not null default '',
  status text not null default 'draft',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reading_plans_status_check check (status in ('draft', 'published'))
);

create table if not exists public.reading_plan_steps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid not null references public.reading_plans(id) on delete cascade,
  day_number integer not null,
  title text not null,
  content text not null default '',
  scripture_ref text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint reading_plan_steps_day_check check (day_number > 0),
  constraint reading_plan_steps_plan_day_unique unique (plan_id, day_number)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  priority text not null default 'medium',
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint announcements_priority_check check (priority in ('low', 'medium', 'high'))
);

create table if not exists public.notification_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content text not null,
  method text not null default 'push',
  type text not null default 'general',
  target_group text not null default '',
  scheduled_send boolean not null default false,
  send_date date,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notifications_method_check check (method in ('push', 'email', 'sms')),
  constraint notifications_type_check check (type in ('general', 'group', 'birthday')),
  constraint notifications_status_check check (status in ('sent', 'scheduled', 'draft'))
);

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null default '#10b981',
  type text not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint financial_categories_type_check check (type in ('revenue', 'expense')),
  constraint financial_categories_company_type_name_unique unique (company_id, type, name)
);

create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  responsible text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  description text not null,
  bank text not null default '',
  account_type text not null default '',
  initial_balance numeric(14,2) not null default 0,
  agency text not null default '',
  account text not null default '',
  digit text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  document text not null default '',
  responsible text not null default '',
  phone text not null default '',
  email text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.revenues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(14,2) not null,
  category text not null default '',
  subcategory text not null default '',
  received_from text not null default 'person',
  received_from_name text not null default '',
  description text not null,
  cost_center text not null default '',
  bank_account text not null default '',
  payment_method text not null default '',
  due_date date,
  payment_date date not null default current_date,
  received boolean not null default true,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint revenues_amount_check check (amount >= 0),
  constraint revenues_received_from_check check (received_from in ('anonymous', 'supplier', 'person'))
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(14,2) not null,
  category text not null default '',
  subcategory text not null default '',
  paid_to text not null default 'supplier',
  paid_to_name text not null default '',
  description text not null,
  cost_center text not null default '',
  bank_account text not null default '',
  payment_method text not null default '',
  due_date date,
  payment_date date not null default current_date,
  paid boolean not null default true,
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint expenses_amount_check check (amount >= 0),
  constraint expenses_paid_to_check check (paid_to in ('supplier'))
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  donor_name text not null default '',
  amount numeric(14,2) not null,
  reason text not null default '',
  method text not null default 'pix',
  donated_on date not null default current_date,
  status text not null default 'confirmed',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint donations_amount_check check (amount >= 0),
  constraint donations_method_check check (method in ('pix', 'card', 'boleto', 'cash')),
  constraint donations_status_check check (status in ('confirmed', 'pending', 'cancelled'))
);

create table if not exists public.donation_recurrences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.people(id) on delete set null,
  user_name text not null default '',
  reason text not null default '',
  amount numeric(14,2) not null,
  frequency text not null default 'monthly',
  is_active boolean not null default true,
  pending boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint donation_recurrences_amount_check check (amount >= 0),
  constraint donation_recurrences_frequency_check check (frequency in ('monthly', 'weekly', 'yearly'))
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  billing_cycle text not null default 'monthly',
  billing_interval integer not null default 1,
  auto_renew boolean not null default true,
  discount_type text not null default 'none',
  discount_value numeric(14,2) not null default 0,
  price numeric(14,2) not null default 0,
  signup_fee numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscription_plans_billing_cycle_check check (billing_cycle in ('daily', 'monthly', 'yearly')),
  constraint subscription_plans_discount_type_check check (discount_type in ('none', 'percentage', 'fixed')),
  constraint subscription_plans_money_check check (discount_value >= 0 and price >= 0 and signup_fee >= 0),
  constraint subscription_plans_company_code_unique unique (company_id, code)
);

create table if not exists public.subscription_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscription_tags_company_name_unique unique (company_id, name)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.people(id) on delete set null,
  user_name text not null default '',
  plan_id uuid references public.subscription_plans(id) on delete set null,
  plan_name text not null default '',
  price numeric(14,2) not null default 0,
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscriptions_status_check check (status in ('active', 'expired', 'suspended', 'pending', 'awaiting_payment')),
  constraint subscriptions_price_check check (price >= 0)
);

create table if not exists public.subscription_contents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  production_year text not null default '',
  content_type text not null default 'youtube',
  content_code text not null default '',
  highlight_image_url text not null default '',
  cover_image_url text not null default '',
  is_draft boolean not null default false,
  is_featured boolean not null default false,
  is_coming_soon boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint subscription_contents_type_check check (content_type in ('youtube', 'vimeo'))
);

create table if not exists public.subscription_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  description text not null default '',
  tags jsonb not null default '[]'::jsonb,
  highlight_image_url text not null default '',
  cover_image_url text not null default '',
  is_featured boolean not null default false,
  is_coming_soon boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.subscription_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  name text not null default 'InPeace Play',
  description text not null default '',
  visibility_type text not null default 'closed',
  email_bg_color text not null default '#1a1a2e',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_settings_visibility_check check (visibility_type in ('open', 'closed'))
);

create index if not exists events_company_starts_idx on public.events(company_id, starts_at desc) where deleted_at is null;
create index if not exists attendance_company_date_idx on public.attendance_records(company_id, occurred_on desc) where deleted_at is null;
create index if not exists crm_cards_company_stage_idx on public.crm_cards(company_id, stage, created_at desc) where deleted_at is null;
create index if not exists prayer_requests_company_status_idx on public.prayer_requests(company_id, status, updated_at desc) where deleted_at is null;
create index if not exists reading_plans_company_status_idx on public.reading_plans(company_id, status, created_at desc) where deleted_at is null;
create index if not exists announcements_company_published_idx on public.announcements(company_id, published, created_at desc) where deleted_at is null;
create index if not exists notifications_company_status_idx on public.notifications(company_id, status, created_at desc) where deleted_at is null;
create index if not exists revenues_company_payment_date_idx on public.revenues(company_id, payment_date desc) where deleted_at is null;
create index if not exists expenses_company_payment_date_idx on public.expenses(company_id, payment_date desc) where deleted_at is null;
create index if not exists donations_company_date_idx on public.donations(company_id, donated_on desc) where deleted_at is null;
create index if not exists subscriptions_company_status_idx on public.subscriptions(company_id, status, start_date desc) where deleted_at is null;

do $$
declare
  table_name text;
  managed_tables text[] := array[
    'events',
    'attendance_records',
    'crm_cards',
    'prayer_requests',
    'reading_plans',
    'reading_plan_steps',
    'announcements',
    'notification_groups',
    'notifications',
    'financial_categories',
    'cost_centers',
    'bank_accounts',
    'suppliers',
    'revenues',
    'expenses',
    'donations',
    'donation_recurrences',
    'subscription_plans',
    'subscription_tags',
    'subscriptions',
    'subscription_contents',
    'subscription_collections',
    'subscription_settings'
  ];
begin
  foreach table_name in array managed_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || ' company access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || ' company access',
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(name, color, type) as (
  values
    ('Dízimos', '#10b981', 'revenue'),
    ('Ofertas', '#0ea5e9', 'revenue'),
    ('Doações', '#8b5cf6', 'revenue'),
    ('Aluguel', '#ef4444', 'expense'),
    ('Infraestrutura', '#f97316', 'expense')
)
insert into public.financial_categories (company_id, name, color, type)
select target_company.id, seed.name, seed.color, seed.type
from target_company
cross join seed
on conflict (company_id, type, name) do update
set color = excluded.color,
    is_active = true,
    deleted_at = null,
    updated_at = now();
