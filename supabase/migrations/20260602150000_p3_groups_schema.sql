create table if not exists public.group_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_categories_company_name_unique unique (company_id, name)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.group_categories(id) on delete set null,
  congregation_id uuid references public.congregations(id) on delete set null,
  name text not null,
  description text not null default '',
  type text not null default 'cell',
  leader_person_id uuid references public.people(id) on delete set null,
  co_leader_person_id uuid references public.people(id) on delete set null,
  coordinator_person_id uuid references public.people(id) on delete set null,
  meeting_day text not null default '',
  meeting_time time,
  meeting_location text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  max_capacity integer not null default 0,
  min_age integer,
  max_age integer,
  accepts_requests boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint groups_type_check check (type in ('cell', 'ministry', 'department', 'class')),
  constraint groups_capacity_check check (max_capacity >= 0),
  constraint groups_age_check check (
    (min_age is null or min_age >= 0)
    and (max_age is null or max_age >= 0)
    and (min_age is null or max_age is null or min_age <= max_age)
  )
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at date not null default current_date,
  left_at date,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_members_role_check check (role in ('member', 'leader', 'co_leader', 'host', 'visitor')),
  constraint group_members_status_check check (status in ('active', 'inactive', 'pending')),
  constraint group_members_unique unique (group_id, person_id)
);

create table if not exists public.group_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  study_id uuid,
  title text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '',
  notes text not null default '',
  report_status text not null default 'scheduled',
  present_count integer not null default 0,
  visitor_count integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_meetings_report_status_check check (report_status in ('scheduled', 'reported', 'cancelled')),
  constraint group_meetings_counts_check check (present_count >= 0 and visitor_count >= 0)
);

create table if not exists public.group_studies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  content_type text not null default 'lesson',
  content text not null default '',
  scripture_ref text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_studies_content_type_check check (content_type in ('dynamic', 'lesson', 'preaching'))
);

alter table public.group_meetings
drop constraint if exists group_meetings_study_id_fkey;

alter table public.group_meetings
add constraint group_meetings_study_id_fkey
foreign key (study_id) references public.group_studies(id) on delete set null;

create table if not exists public.group_hierarchy_levels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.group_coordinators (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  hierarchy_level_id uuid references public.group_hierarchy_levels(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_coordinators_unique unique (group_id, person_id)
);

create table if not exists public.group_email_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  subject text not null default '',
  body text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_email_templates_event_type_check check (event_type in ('member_added', 'member_removed', 'request_approved', 'request_rejected')),
  constraint group_email_templates_company_event_unique unique (company_id, event_type)
);

create table if not exists public.group_multiplications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_group_id uuid not null references public.groups(id) on delete cascade,
  target_group_id uuid references public.groups(id) on delete set null,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint group_multiplications_status_check check (status in ('pending', 'approved', 'completed', 'rejected'))
);

create index if not exists group_categories_company_active_idx
on public.group_categories(company_id, is_active, sort_order)
where deleted_at is null;

create index if not exists groups_company_active_idx
on public.groups(company_id, is_active, created_at desc)
where deleted_at is null;

create index if not exists groups_company_category_idx
on public.groups(company_id, category_id)
where deleted_at is null;

create index if not exists groups_company_search_idx
on public.groups using gin (to_tsvector('portuguese', name || ' ' || description || ' ' || meeting_location));

create index if not exists group_members_group_status_idx
on public.group_members(group_id, status);

create index if not exists group_members_person_idx
on public.group_members(person_id);

create index if not exists group_meetings_group_starts_idx
on public.group_meetings(group_id, starts_at desc)
where deleted_at is null;

create index if not exists group_studies_company_active_idx
on public.group_studies(company_id, is_active, created_at desc)
where deleted_at is null;

create index if not exists group_multiplications_company_status_idx
on public.group_multiplications(company_id, status, requested_at desc)
where deleted_at is null;

drop trigger if exists group_categories_set_updated_at on public.group_categories;
create trigger group_categories_set_updated_at before update on public.group_categories
for each row execute function public.set_updated_at();

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at before update on public.groups
for each row execute function public.set_updated_at();

drop trigger if exists group_members_set_updated_at on public.group_members;
create trigger group_members_set_updated_at before update on public.group_members
for each row execute function public.set_updated_at();

drop trigger if exists group_meetings_set_updated_at on public.group_meetings;
create trigger group_meetings_set_updated_at before update on public.group_meetings
for each row execute function public.set_updated_at();

drop trigger if exists group_studies_set_updated_at on public.group_studies;
create trigger group_studies_set_updated_at before update on public.group_studies
for each row execute function public.set_updated_at();

drop trigger if exists group_hierarchy_levels_set_updated_at on public.group_hierarchy_levels;
create trigger group_hierarchy_levels_set_updated_at before update on public.group_hierarchy_levels
for each row execute function public.set_updated_at();

drop trigger if exists group_coordinators_set_updated_at on public.group_coordinators;
create trigger group_coordinators_set_updated_at before update on public.group_coordinators
for each row execute function public.set_updated_at();

drop trigger if exists group_email_templates_set_updated_at on public.group_email_templates;
create trigger group_email_templates_set_updated_at before update on public.group_email_templates
for each row execute function public.set_updated_at();

drop trigger if exists group_multiplications_set_updated_at on public.group_multiplications;
create trigger group_multiplications_set_updated_at before update on public.group_multiplications
for each row execute function public.set_updated_at();

alter table public.group_categories enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_meetings enable row level security;
alter table public.group_studies enable row level security;
alter table public.group_hierarchy_levels enable row level security;
alter table public.group_coordinators enable row level security;
alter table public.group_email_templates enable row level security;
alter table public.group_multiplications enable row level security;

drop policy if exists "Group categories company access" on public.group_categories;
create policy "Group categories company access" on public.group_categories
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Groups company access" on public.groups;
create policy "Groups company access" on public.groups
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group members company access" on public.group_members;
create policy "Group members company access" on public.group_members
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group meetings company access" on public.group_meetings;
create policy "Group meetings company access" on public.group_meetings
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group studies company access" on public.group_studies;
create policy "Group studies company access" on public.group_studies
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group hierarchy levels company access" on public.group_hierarchy_levels;
create policy "Group hierarchy levels company access" on public.group_hierarchy_levels
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group coordinators company access" on public.group_coordinators;
create policy "Group coordinators company access" on public.group_coordinators
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group email templates company access" on public.group_email_templates;
create policy "Group email templates company access" on public.group_email_templates
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Group multiplications company access" on public.group_multiplications;
create policy "Group multiplications company access" on public.group_multiplications
for all to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select, insert, update, delete on public.group_categories to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_meetings to authenticated;
grant select, insert, update, delete on public.group_studies to authenticated;
grant select, insert, update, delete on public.group_hierarchy_levels to authenticated;
grant select, insert, update, delete on public.group_coordinators to authenticated;
grant select, insert, update, delete on public.group_email_templates to authenticated;
grant select, insert, update, delete on public.group_multiplications to authenticated;

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(name, sort_order) as (
  values
    ('Família', 10),
    ('Jovens', 20),
    ('Mulheres', 30),
    ('Discipulado', 40),
    ('Homens', 50)
)
insert into public.group_categories (company_id, name, sort_order)
select c.id, seed.name, seed.sort_order
from target_company c
cross join seed
on conflict (company_id, name) do update
set sort_order = excluded.sort_order,
    is_active = true,
    deleted_at = null,
    updated_at = now();

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(category_name, group_name, description, leader_email, meeting_day, meeting_time, meeting_location, neighborhood, city, max_capacity) as (
  values
    ('Família', 'GCEU Família Restaurada', 'Grupo de comunhão e discipulado para famílias.', 'joao@email.com', 'Quarta', '20:00'::time, 'Rua das Palmeiras, 100', 'Centro', 'São Paulo', 18),
    ('Jovens', 'GCEU Jovens em Ação', 'Grupo para jovens com estudo bíblico e integração.', 'lucas@email.com', 'Sábado', '19:30'::time, 'Av. das Oliveiras, 900', 'Jardim das Oliveiras', 'São Paulo', 25),
    ('Mulheres', 'GCEU Mulheres de Fé', 'Grupo de oração, cuidado e discipulado feminino.', 'maria@email.com', 'Terça', '19:00'::time, 'Rua Esperança, 45', 'Vila Esperança', 'São Paulo', 20)
)
insert into public.groups (
  company_id,
  category_id,
  name,
  description,
  type,
  leader_person_id,
  meeting_day,
  meeting_time,
  meeting_location,
  neighborhood,
  city,
  max_capacity
)
select
  c.id,
  gc.id,
  seed.group_name,
  seed.description,
  'cell',
  p.id,
  seed.meeting_day,
  seed.meeting_time,
  seed.meeting_location,
  seed.neighborhood,
  seed.city,
  seed.max_capacity
from target_company c
join seed on true
left join public.group_categories gc on gc.company_id = c.id and gc.name = seed.category_name
left join public.people p on p.company_id = c.id and lower(p.email) = lower(seed.leader_email) and p.deleted_at is null
where not exists (
  select 1 from public.groups existing
  where existing.company_id = c.id
    and lower(existing.name) = lower(seed.group_name)
    and existing.deleted_at is null
);

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(group_name, member_email, role) as (
  values
    ('GCEU Família Restaurada', 'joao@email.com', 'leader'),
    ('GCEU Família Restaurada', 'pedro@email.com', 'member'),
    ('GCEU Família Restaurada', 'juliana@email.com', 'member'),
    ('GCEU Jovens em Ação', 'lucas@email.com', 'leader'),
    ('GCEU Jovens em Ação', 'ana@email.com', 'visitor'),
    ('GCEU Mulheres de Fé', 'maria@email.com', 'leader')
)
insert into public.group_members (company_id, group_id, person_id, role, status)
select c.id, g.id, p.id, seed.role, 'active'
from target_company c
join seed on true
join public.groups g on g.company_id = c.id and g.name = seed.group_name and g.deleted_at is null
join public.people p on p.company_id = c.id and lower(p.email) = lower(seed.member_email) and p.deleted_at is null
on conflict (group_id, person_id) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(title, content_type, content, scripture_ref) as (
  values
    ('Comunhão que edifica', 'lesson', 'Estudo sobre vida em comunidade e cuidado mútuo.', 'Atos 2:42-47'),
    ('O chamado para servir', 'preaching', 'Reflexão sobre serviço cristão e liderança humilde.', 'Marcos 10:45')
)
insert into public.group_studies (company_id, title, content_type, content, scripture_ref)
select c.id, seed.title, seed.content_type, seed.content, seed.scripture_ref
from target_company c
cross join seed
where not exists (
  select 1 from public.group_studies existing
  where existing.company_id = c.id
    and lower(existing.title) = lower(seed.title)
    and existing.deleted_at is null
);

with target_company as (
  select id from public.companies where legacy_id = 'c1' limit 1
),
seed(event_type, subject, body) as (
  values
    ('member_added', 'Bem-vindo ao grupo', 'Você foi adicionado ao grupo.'),
    ('member_removed', 'Atualização do grupo', 'Sua participação no grupo foi atualizada.'),
    ('request_approved', 'Solicitação aprovada', 'Sua solicitação para participar do grupo foi aprovada.'),
    ('request_rejected', 'Solicitação revisada', 'Sua solicitação para participar do grupo foi revisada.')
)
insert into public.group_email_templates (company_id, event_type, subject, body)
select c.id, seed.event_type, seed.subject, seed.body
from target_company c
cross join seed
on conflict (company_id, event_type) do update
set subject = excluded.subject,
    body = excluded.body,
    is_active = true,
    deleted_at = null,
    updated_at = now();
