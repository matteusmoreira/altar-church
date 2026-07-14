-- CRM stages (dynamic kanban columns) + Forms builder

-- 1) CRM stages
create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  color text not null default '#6366f1',
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint crm_stages_key_format check (key ~ '^[a-z0-9-]+$')
);

create unique index if not exists crm_stages_company_key_unique
  on public.crm_stages(company_id, key)
  where deleted_at is null;

create index if not exists crm_stages_company_sort_idx
  on public.crm_stages(company_id, sort_order)
  where deleted_at is null;

-- Seed default stages for every company
with defaults(key, name, color, sort_order, is_default) as (
  values
    ('new', 'Novo', '#6366f1', 10, true),
    ('contacted', 'Contactado', '#0ea5e9', 20, false),
    ('meeting', 'Reunião', '#8b5cf6', 30, false),
    ('visiting', 'Visitando', '#f59e0b', 40, false),
    ('member', 'Membro', '#10b981', 50, false),
    ('inactive', 'Inativo', '#94a3b8', 60, false)
)
insert into public.crm_stages (company_id, key, name, color, sort_order, is_default)
select c.id, d.key, d.name, d.color, d.sort_order, d.is_default
from public.companies c
cross join defaults d
where not exists (
  select 1 from public.crm_stages s
  where s.company_id = c.id and s.key = d.key and s.deleted_at is null
);

-- 2) Link crm_cards to stages
alter table public.crm_cards
  add column if not exists stage_id uuid references public.crm_stages(id) on delete restrict;

update public.crm_cards card
set stage_id = stage.id
from public.crm_stages stage
where card.stage_id is null
  and stage.company_id = card.company_id
  and stage.key = card.stage
  and stage.deleted_at is null;

-- Fallback: any remaining cards go to company default stage
update public.crm_cards card
set stage_id = stage.id
from public.crm_stages stage
where card.stage_id is null
  and stage.company_id = card.company_id
  and stage.is_default = true
  and stage.deleted_at is null;

-- Last resort: first stage by sort
update public.crm_cards card
set stage_id = stage.id
from (
  select distinct on (company_id) id, company_id
  from public.crm_stages
  where deleted_at is null
  order by company_id, sort_order, created_at
) stage
where card.stage_id is null
  and stage.company_id = card.company_id;

alter table public.crm_cards
  alter column stage_id set not null;

alter table public.crm_cards
  drop constraint if exists crm_cards_stage_check;

alter table public.crm_cards
  drop column if exists stage;

drop index if exists public.crm_cards_company_stage_idx;
create index if not exists crm_cards_company_stage_id_idx
  on public.crm_cards(company_id, stage_id, created_at desc)
  where deleted_at is null;

-- 3) Forms
create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  slug text not null,
  description text not null default '',
  status text not null default 'draft',
  target_stage_id uuid references public.crm_stages(id) on delete set null,
  success_message text not null default 'Obrigado! Recebemos suas informações.',
  submit_button_label text not null default 'Enviar',
  create_person boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint forms_status_check check (status in ('draft', 'published', 'archived')),
  constraint forms_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create unique index if not exists forms_company_slug_unique
  on public.forms(company_id, slug)
  where deleted_at is null;

create index if not exists forms_company_status_idx
  on public.forms(company_id, status, updated_at desc)
  where deleted_at is null;

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  field_type text not null default 'text',
  label text not null,
  field_key text not null,
  placeholder text not null default '',
  help_text text not null default '',
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  map_to text not null default 'none',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint form_fields_type_check check (
    field_type in ('text', 'email', 'phone', 'textarea', 'number', 'select', 'checkbox', 'date')
  ),
  constraint form_fields_map_to_check check (
    map_to in ('person_name', 'person_email', 'person_phone', 'notes', 'none')
  ),
  constraint form_fields_key_format check (field_key ~ '^[a-z0-9_]+$')
);

create unique index if not exists form_fields_form_key_unique
  on public.form_fields(form_id, field_key)
  where deleted_at is null;

create index if not exists form_fields_form_sort_idx
  on public.form_fields(form_id, sort_order)
  where deleted_at is null;

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  form_id uuid not null references public.forms(id) on delete cascade,
  crm_card_id uuid references public.crm_cards(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists form_submissions_form_created_idx
  on public.form_submissions(form_id, created_at desc);

create index if not exists form_submissions_company_created_idx
  on public.form_submissions(company_id, created_at desc);

-- 4) RLS + triggers
do $$
declare
  table_name text;
  managed_tables text[] := array[
    'crm_stages',
    'forms',
    'form_fields',
    'form_submissions'
  ];
begin
  foreach table_name in array managed_tables loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    if table_name <> 'form_submissions' then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        table_name || '_set_updated_at',
        table_name
      );
    end if;
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

-- 5) System module + plans
insert into public.system_modules (id, label, description, route, menu_group, icon_name, required_permission, sort_order)
values (
  'forms',
  'Formulários',
  'Construtor de formulários públicos com destino no Kanban.',
  '/formularios',
  'Administrar',
  'ClipboardList',
  'forms.view',
  195
)
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

insert into public.plan_modules (plan_id, module_id, included)
select plan.id, 'forms', true
from public.system_plans plan
where plan.code in ('premium', 'enterprise')
on conflict (plan_id, module_id) do update set included = true, updated_at = now();

-- Enable for companies that already have CRM (same audience)
insert into public.company_modules (company_id, module_id, enabled)
select cm.company_id, 'forms', true
from public.company_modules cm
where cm.module_id = 'crm'
  and cm.enabled = true
on conflict (company_id, module_id) do nothing;

insert into public.company_modules (company_id, module_id, enabled)
select c.id, 'forms', true
from public.companies c
join public.system_plans p on p.id = c.plan_id
where p.code in ('premium', 'enterprise')
on conflict (company_id, module_id) do nothing;
