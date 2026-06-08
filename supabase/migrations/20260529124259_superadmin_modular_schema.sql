create extension if not exists pgcrypto with schema extensions;

create table if not exists public.system_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  price numeric(10, 2) not null default 0,
  billing_cycle text not null default 'monthly',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_plans_code_format check (code ~ '^[a-z0-9_]+$'),
  constraint system_plans_billing_cycle_check check (billing_cycle in ('free', 'monthly', 'yearly', 'custom')),
  constraint system_plans_price_check check (price >= 0)
);

create table if not exists public.system_modules (
  id text primary key,
  label text not null,
  description text not null default '',
  route text not null,
  menu_group text not null,
  icon_name text not null,
  required_permission text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_modules_id_format check (id ~ '^[a-z0-9_-]+$'),
  constraint system_modules_route_format check (route ~ '^/')
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  slug text not null unique,
  responsible_name text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  phone text not null default '',
  email text not null default '',
  plan_id uuid references public.system_plans(id) on delete set null,
  status text not null default 'active',
  active boolean not null default true,
  member_count integer not null default 0,
  user_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_status_check check (status in ('active', 'blocked', 'test')),
  constraint companies_member_count_check check (member_count >= 0),
  constraint companies_user_count_check check (user_count >= 0),
  constraint companies_slug_format check (slug ~ '^[a-z0-9-]+$')
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  name text not null,
  email text not null unique,
  role text not null default 'reader',
  active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (
    role in (
      'superadmin',
      'admin',
      'pastor',
      'ministry_leader',
      'cell_leader',
      'communication',
      'finance',
      'volunteer',
      'reader'
    )
  )
);

create table if not exists public.plan_modules (
  plan_id uuid not null references public.system_plans(id) on delete cascade,
  module_id text not null references public.system_modules(id) on delete cascade,
  included boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, module_id)
);

create table if not exists public.company_modules (
  company_id uuid not null references public.companies(id) on delete cascade,
  module_id text not null references public.system_modules(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, module_id)
);

create index if not exists companies_plan_id_idx on public.companies(plan_id);
create index if not exists companies_status_active_idx on public.companies(status, active);
create index if not exists profiles_company_id_idx on public.profiles(company_id);
create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists plan_modules_module_id_idx on public.plan_modules(module_id);
create index if not exists company_modules_module_id_idx on public.company_modules(module_id);
create index if not exists system_modules_active_sort_idx on public.system_modules(active, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists system_plans_set_updated_at on public.system_plans;
create trigger system_plans_set_updated_at
before update on public.system_plans
for each row execute function public.set_updated_at();

drop trigger if exists system_modules_set_updated_at on public.system_modules;
create trigger system_modules_set_updated_at
before update on public.system_modules
for each row execute function public.set_updated_at();

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists plan_modules_set_updated_at on public.plan_modules;
create trigger plan_modules_set_updated_at
before update on public.plan_modules
for each row execute function public.set_updated_at();

drop trigger if exists company_modules_set_updated_at on public.company_modules;
create trigger company_modules_set_updated_at
before update on public.company_modules
for each row execute function public.set_updated_at();

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
      and role = 'superadmin'
      and active = true
  );
$$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
      and company_id = target_company_id
      and active = true
  );
$$;

revoke all on function public.is_superadmin() from public;
revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_company_member(uuid) to authenticated;

alter table public.system_plans enable row level security;
alter table public.system_modules enable row level security;
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.plan_modules enable row level security;
alter table public.company_modules enable row level security;

drop policy if exists "Active plans are readable" on public.system_plans;
create policy "Active plans are readable"
on public.system_plans
for select
to authenticated
using (active = true or (select public.is_superadmin()));

drop policy if exists "Superadmins manage plans" on public.system_plans;
create policy "Superadmins manage plans"
on public.system_plans
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

drop policy if exists "Active modules are readable" on public.system_modules;
create policy "Active modules are readable"
on public.system_modules
for select
to authenticated
using (active = true or (select public.is_superadmin()));

drop policy if exists "Superadmins manage modules" on public.system_modules;
create policy "Superadmins manage modules"
on public.system_modules
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

drop policy if exists "Company members read own company" on public.companies;
create policy "Company members read own company"
on public.companies
for select
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(id)));

drop policy if exists "Superadmins manage companies" on public.companies;
create policy "Superadmins manage companies"
on public.companies
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

drop policy if exists "Users read allowed profiles" on public.profiles;
create policy "Users read allowed profiles"
on public.profiles
for select
to authenticated
using (
  auth_user_id = (select auth.uid())
  or (select public.is_superadmin())
  or (company_id is not null and (select public.is_company_member(company_id)))
);

drop policy if exists "Superadmins manage profiles" on public.profiles;
create policy "Superadmins manage profiles"
on public.profiles
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

drop policy if exists "Plan modules are readable" on public.plan_modules;
create policy "Plan modules are readable"
on public.plan_modules
for select
to authenticated
using (true);

drop policy if exists "Superadmins manage plan modules" on public.plan_modules;
create policy "Superadmins manage plan modules"
on public.plan_modules
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

drop policy if exists "Company modules readable by company" on public.company_modules;
create policy "Company modules readable by company"
on public.company_modules
for select
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Superadmins manage company modules" on public.company_modules;
create policy "Superadmins manage company modules"
on public.company_modules
for all
to authenticated
using ((select public.is_superadmin()))
with check ((select public.is_superadmin()));

grant usage on schema public to anon, authenticated;
grant select on public.system_plans to authenticated;
grant select on public.system_modules to authenticated;
grant select on public.plan_modules to authenticated;
grant select on public.companies to authenticated;
grant select on public.profiles to authenticated;
grant select on public.company_modules to authenticated;
grant insert, update, delete on public.system_plans to authenticated;
grant insert, update, delete on public.system_modules to authenticated;
grant insert, update, delete on public.plan_modules to authenticated;
grant insert, update, delete on public.companies to authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.company_modules to authenticated;

insert into public.system_modules (id, label, description, route, menu_group, icon_name, required_permission, sort_order)
values
  ('dashboard', 'Dashboard', 'Visao geral da empresa.', '/dashboard', 'Inicio', 'LayoutDashboard', null, 10),
  ('church-info', 'Informacoes', 'Dados institucionais da igreja.', '/church-info', 'Sobre a Igreja', 'Church', 'settings.edit', 20),
  ('ministries', 'Ministerios', 'Cadastro e gestao de ministerios.', '/ministries', 'Sobre a Igreja', 'Heart', 'ministries.view', 30),
  ('programming', 'Programacao', 'Agenda de programacoes recorrentes.', '/programming', 'Sobre a Igreja', 'CalendarDays', 'events.view', 40),
  ('songs', 'Louvor', 'Repertorio e musicas.', '/songs', 'Sobre a Igreja', 'Music', 'content.view', 50),
  ('congregations', 'Congregacoes', 'Unidades e congregacoes vinculadas.', '/congregations', 'Sobre a Igreja', 'Building2', 'settings.edit', 60),
  ('members', 'Pessoas', 'Membros, visitantes e cadastros.', '/members', 'Cuidar', 'Users', 'members.view', 70),
  ('visitors', 'Visitantes', 'Acompanhamento de visitantes.', '/visitors', 'Cuidar', 'UsersRound', 'visitors.view', 80),
  ('groups', 'GCEUs', 'Grupos, classes e departamentos.', '/groups', 'Cuidar', 'Home', 'groups.view', 90),
  ('cells', 'Celulas', 'Celulas e relatorios de encontro.', '/cells', 'Cuidar', 'Network', 'cells.view', 100),
  ('prayer', 'Intercessao', 'Pedidos e acompanhamento de oracao.', '/prayer', 'Cuidar', 'HandHeart', 'prayer.view', 110),
  ('reading-plans', 'Discipulado', 'Planos de leitura e trilhas.', '/reading-plans', 'Cuidar', 'BookOpen', 'content.view', 120),
  ('events', 'Eventos', 'Eventos publicos e internos.', '/events', 'Comunicar', 'CalendarDays', 'events.view', 130),
  ('content', 'Conteudo', 'Noticias, devocionais e publicacoes.', '/content', 'Comunicar', 'Newspaper', 'content.view', 140),
  ('notifications', 'Notificacao', 'Envio e agenda de notificacoes.', '/notifications', 'Comunicar', 'Bell', 'notification.view', 150),
  ('communication', 'Comunicacao', 'Campanhas e comunicacao com pessoas.', '/communication', 'Comunicar', 'MessageSquare', 'communication.view', 160),
  ('inpeace-play', 'InPeace Play', 'Conteudos de video e assinaturas.', '/inpeace-play', 'Comunicar', 'Play', 'subscription.view', 170),
  ('attendance', 'Presenca', 'Registros de presenca por evento.', '/attendance', 'Administrar', 'ClipboardCheck', 'attendance.view', 180),
  ('crm', 'CRM', 'Pipeline de relacionamento.', '/crm', 'Administrar', 'KanbanSquare', 'crm.view', 190),
  ('finance', 'Financeiro', 'Receitas, despesas e contas.', '/finance', 'Administrar', 'DollarSign', 'finance.view', 200),
  ('donations', 'Doacao', 'Doacoes e recorrencias.', '/donations', 'Administrar', 'Gift', 'donation.view', 210),
  ('reports', 'Relatorios', 'Indicadores e relatorios gerenciais.', '/reports', 'Administrar', 'BarChart3', 'reports.view', 220),
  ('settings', 'Configuracoes', 'Configuracoes gerais da empresa.', '/settings', 'Administrar', 'Settings', 'settings.edit', 230)
on conflict (id) do update
set label = excluded.label,
    description = excluded.description,
    route = excluded.route,
    menu_group = excluded.menu_group,
    icon_name = excluded.icon_name,
    required_permission = excluded.required_permission,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.system_plans (code, name, description, price, billing_cycle, active, sort_order)
values
  ('free', 'Gratuito', 'Plano inicial para validar a plataforma.', 0, 'free', true, 10),
  ('basic', 'Basico', 'Operacao essencial de igreja local.', 99.90, 'monthly', true, 20),
  ('premium', 'Premium', 'Gestao completa com comunicacao e financeiro.', 299.90, 'monthly', true, 30),
  ('enterprise', 'Enterprise', 'Pacote completo com todos os modulos.', 799.90, 'custom', true, 40)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    billing_cycle = excluded.billing_cycle,
    active = excluded.active,
    sort_order = excluded.sort_order,
    updated_at = now();

with plan_module_seed(plan_code, module_id) as (
  values
    ('free', 'dashboard'),
    ('free', 'church-info'),
    ('free', 'members'),
    ('free', 'events'),
    ('free', 'settings'),
    ('basic', 'dashboard'),
    ('basic', 'church-info'),
    ('basic', 'members'),
    ('basic', 'events'),
    ('basic', 'settings'),
    ('basic', 'groups'),
    ('basic', 'cells'),
    ('basic', 'ministries'),
    ('basic', 'prayer'),
    ('basic', 'reading-plans'),
    ('basic', 'attendance'),
    ('basic', 'reports'),
    ('premium', 'dashboard'),
    ('premium', 'church-info'),
    ('premium', 'members'),
    ('premium', 'events'),
    ('premium', 'settings'),
    ('premium', 'groups'),
    ('premium', 'cells'),
    ('premium', 'ministries'),
    ('premium', 'prayer'),
    ('premium', 'reading-plans'),
    ('premium', 'attendance'),
    ('premium', 'reports'),
    ('premium', 'finance'),
    ('premium', 'donations'),
    ('premium', 'communication'),
    ('premium', 'notifications'),
    ('premium', 'content'),
    ('premium', 'programming'),
    ('premium', 'songs'),
    ('premium', 'congregations'),
    ('premium', 'visitors'),
    ('premium', 'crm'),
    ('enterprise', 'dashboard'),
    ('enterprise', 'church-info'),
    ('enterprise', 'members'),
    ('enterprise', 'events'),
    ('enterprise', 'settings'),
    ('enterprise', 'groups'),
    ('enterprise', 'cells'),
    ('enterprise', 'ministries'),
    ('enterprise', 'prayer'),
    ('enterprise', 'reading-plans'),
    ('enterprise', 'attendance'),
    ('enterprise', 'reports'),
    ('enterprise', 'finance'),
    ('enterprise', 'donations'),
    ('enterprise', 'communication'),
    ('enterprise', 'notifications'),
    ('enterprise', 'content'),
    ('enterprise', 'programming'),
    ('enterprise', 'songs'),
    ('enterprise', 'congregations'),
    ('enterprise', 'visitors'),
    ('enterprise', 'crm'),
    ('enterprise', 'inpeace-play')
)
insert into public.plan_modules (plan_id, module_id, included)
select p.id, seed.module_id, true
from plan_module_seed seed
join public.system_plans p on p.code = seed.plan_code
on conflict (plan_id, module_id) do update
set included = excluded.included,
    updated_at = now();

insert into public.companies (legacy_id, name, slug, responsible_name, address, city, state, phone, email, plan_id, status, active, member_count, user_count)
select seed.legacy_id,
       seed.name,
       seed.slug,
       seed.responsible_name,
       seed.address,
       seed.city,
       seed.state,
       seed.phone,
       seed.email,
       p.id,
       seed.status,
       seed.active,
       seed.member_count,
       seed.user_count
from (
  values
    ('c1', 'Igreja Batista Central', 'batista-central', 'Pastor Joao Silva', 'Rua das Flores, 123', 'Sao Paulo', 'SP', '(11) 3456-7890', 'contato@batistacentral.com.br', 'premium', 'active', true, 342, 5),
    ('c2', 'Comunidade Graca Viva', 'graca-viva', 'Pastor Carlos Mendes', 'Av. Brasil, 456', 'Rio de Janeiro', 'RJ', '(21) 2345-6789', 'contato@gracaviva.com.br', 'basic', 'active', true, 187, 3),
    ('c3', 'Igreja Presbiteriana Renovada', 'presbiteriana-renovada', 'Pastor Roberto Lima', 'Rua da Paz, 789', 'Belo Horizonte', 'MG', '(31) 3456-0123', 'contato@presbiteriana.com.br', 'enterprise', 'active', true, 521, 8),
    ('c4', 'Assembleia de Deus Ministerio', 'assembleia-ministerio', 'Pastor Marcos Souza', 'Rua Esperanca, 321', 'Curitiba', 'PR', '(41) 3333-4567', 'contato@assembleia.com.br', 'free', 'test', true, 95, 2),
    ('c5', 'Igreja do Evangelho Quadrangular', 'quadrangular', 'Pastora Lucia Ferreira', 'Av. da Fe, 654', 'Salvador', 'BA', '(71) 2222-8901', 'contato@quadrangular.com.br', 'basic', 'blocked', false, 156, 4)
) as seed(legacy_id, name, slug, responsible_name, address, city, state, phone, email, plan_code, status, active, member_count, user_count)
join public.system_plans p on p.code = seed.plan_code
on conflict (legacy_id) do update
set name = excluded.name,
    slug = excluded.slug,
    responsible_name = excluded.responsible_name,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    phone = excluded.phone,
    email = excluded.email,
    plan_id = excluded.plan_id,
    status = excluded.status,
    active = excluded.active,
    member_count = excluded.member_count,
    user_count = excluded.user_count,
    updated_at = now();

insert into public.profiles (legacy_id, company_id, name, email, role, active)
select seed.legacy_id,
       c.id,
       seed.name,
       seed.email,
       seed.role,
       true
from (
  values
    ('u1', null, 'Super Admin', 'superadmin@altarchurch.com', 'superadmin'),
    ('u2', 'c1', 'Pastor Joao Silva', 'admin@igreja.com', 'admin'),
    ('u3', 'c1', 'Pastor Pedro Santos', 'pastor@igreja.com', 'pastor'),
    ('u4', 'c1', 'Lucas Oliveira', 'lider@igreja.com', 'ministry_leader'),
    ('u5', 'c1', 'Ana Costa', 'membro@igreja.com', 'volunteer'),
    ('u6', 'c1', 'Marcos Ferreira', 'celula@igreja.com', 'cell_leader'),
    ('u7', 'c1', 'Juliana Mendes', 'comunicacao@igreja.com', 'communication'),
    ('u8', 'c1', 'Roberto Carlos', 'financeiro@igreja.com', 'finance'),
    ('u9', 'c1', 'Camila Santos', 'leitor@igreja.com', 'reader')
) as seed(legacy_id, company_legacy_id, name, email, role)
left join public.companies c on c.legacy_id = seed.company_legacy_id
on conflict (legacy_id) do update
set company_id = excluded.company_id,
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    active = excluded.active,
    updated_at = now();

create or replace view public.company_enabled_modules
with (security_invoker = true)
as
select
  c.id as company_id,
  c.legacy_id as company_legacy_id,
  c.slug as company_slug,
  m.id as module_id,
  m.label,
  m.description,
  m.route,
  m.menu_group,
  m.icon_name,
  m.required_permission,
  m.sort_order,
  coalesce(cm.enabled, pm.included, false) as enabled
from public.companies c
cross join public.system_modules m
left join public.plan_modules pm on pm.plan_id = c.plan_id and pm.module_id = m.id
left join public.company_modules cm on cm.company_id = c.id and cm.module_id = m.id
where c.active = true
  and m.active = true
  and coalesce(cm.enabled, pm.included, false) = true;

grant select on public.company_enabled_modules to authenticated;
