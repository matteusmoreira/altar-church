create table if not exists public.content_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  content_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_categories_type_check check (
    content_type is null or content_type in ('news', 'devotional', 'ebd', 'publication')
  ),
  constraint content_categories_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint content_categories_company_slug_unique unique (company_id, slug)
);

create table if not exists public.content_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid references public.content_categories(id) on delete set null,
  type text not null,
  title text not null,
  slug text not null,
  summary text not null default '',
  content text not null default '',
  author_name text not null default '',
  embed_url text not null default '',
  cover_file_id uuid references public.app_files(id) on delete set null,
  cover_image_url text not null default '',
  status text not null default 'draft',
  scheduled_publish_at timestamptz,
  published_at timestamptz,
  send_push_notification boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_posts_type_check check (type in ('news', 'devotional', 'ebd', 'publication')),
  constraint content_posts_status_check check (status in ('draft', 'published', 'archived')),
  constraint content_posts_slug_format check (slug ~ '^[a-z0-9-]+$'),
  constraint content_posts_company_slug_unique unique (company_id, slug)
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  image_file_id uuid references public.app_files(id) on delete set null,
  image_url text not null default '',
  link_url text not null default '',
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  show_in_apps boolean not null default true,
  show_in_web boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists content_categories_company_active_idx
on public.content_categories(company_id, is_active, sort_order)
where deleted_at is null;

create index if not exists content_posts_company_type_status_idx
on public.content_posts(company_id, type, status, published_at desc)
where deleted_at is null;

create index if not exists content_posts_category_id_idx
on public.content_posts(category_id)
where deleted_at is null;

create index if not exists banners_company_active_sort_idx
on public.banners(company_id, is_active, sort_order, created_at desc)
where deleted_at is null;

drop trigger if exists content_categories_set_updated_at on public.content_categories;
create trigger content_categories_set_updated_at
before update on public.content_categories
for each row execute function public.set_updated_at();

drop trigger if exists content_posts_set_updated_at on public.content_posts;
create trigger content_posts_set_updated_at
before update on public.content_posts
for each row execute function public.set_updated_at();

drop trigger if exists banners_set_updated_at on public.banners;
create trigger banners_set_updated_at
before update on public.banners
for each row execute function public.set_updated_at();

alter table public.content_categories enable row level security;
alter table public.content_posts enable row level security;
alter table public.banners enable row level security;

drop policy if exists "Content categories readable by company" on public.content_categories;
create policy "Content categories readable by company"
on public.content_categories
for select
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Content categories managed by company" on public.content_categories;
create policy "Content categories managed by company"
on public.content_categories
for all
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Content posts readable by company" on public.content_posts;
create policy "Content posts readable by company"
on public.content_posts
for select
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Published content readable publicly" on public.content_posts;
create policy "Published content readable publicly"
on public.content_posts
for select
to anon
using (
  status = 'published'
  and deleted_at is null
  and (published_at is null or published_at <= now())
  and exists (
    select 1
    from public.companies c
    where c.id = company_id
      and c.active = true
      and c.status = 'active'
  )
);

drop policy if exists "Content posts managed by company" on public.content_posts;
create policy "Content posts managed by company"
on public.content_posts
for all
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Banners readable by company" on public.banners;
create policy "Banners readable by company"
on public.banners
for select
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

drop policy if exists "Active banners readable publicly" on public.banners;
create policy "Active banners readable publicly"
on public.banners
for select
to anon
using (
  is_active = true
  and show_in_web = true
  and deleted_at is null
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and exists (
    select 1
    from public.companies c
    where c.id = company_id
      and c.active = true
      and c.status = 'active'
  )
);

drop policy if exists "Banners managed by company" on public.banners;
create policy "Banners managed by company"
on public.banners
for all
to authenticated
using ((select public.is_superadmin()) or (select public.is_company_member(company_id)))
with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)));

grant select on public.content_categories to authenticated;
grant select on public.content_posts to anon, authenticated;
grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.content_categories to authenticated;
grant insert, update, delete on public.content_posts to authenticated;
grant insert, update, delete on public.banners to authenticated;

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(name, slug, description, content_type, sort_order) as (
  values
    ('Notícias', 'noticias', 'Comunicados e novidades da igreja.', 'news', 10),
    ('Devocionais', 'devocionais', 'Reflexões bíblicas para a semana.', 'devotional', 20),
    ('EBD', 'ebd', 'Conteúdo da Escola Bíblica Dominical.', 'ebd', 30),
    ('Publicações', 'publicacoes', 'Artigos e materiais pastorais.', 'publication', 40)
)
insert into public.content_categories (company_id, name, slug, description, content_type, sort_order)
select c.id, seed.name, seed.slug, seed.description, seed.content_type, seed.sort_order
from target_company c
cross join seed
on conflict (company_id, slug) do update
set name = excluded.name,
    description = excluded.description,
    content_type = excluded.content_type,
    sort_order = excluded.sort_order,
    is_active = true,
    deleted_at = null,
    updated_at = now();

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(type, category_slug, title, slug, summary, content, author_name, status, published_at, send_push_notification) as (
  values
    (
      'news',
      'noticias',
      'Culto de Celebração neste domingo',
      'culto-de-celebracao-neste-domingo',
      'Uma programação especial para toda a família.',
      'Prepare sua família para um domingo de comunhão, louvor e Palavra. A equipe de recepção estará pronta para acolher visitantes.',
      'Equipe pastoral',
      'published',
      now() - interval '3 days',
      true
    ),
    (
      'devotional',
      'devocionais',
      'Perseverança em tempos difíceis',
      'perseveranca-em-tempos-dificeis',
      'Devocional para fortalecer a caminhada diária.',
      'A perseverança cristã nasce da confiança em Deus e se expressa em pequenos atos de fidelidade todos os dias.',
      'Pastor João Silva',
      'published',
      now() - interval '1 day',
      false
    ),
    (
      'ebd',
      'ebd',
      'Introdução ao livro de Atos',
      'introducao-ao-livro-de-atos',
      'Material de apoio para a próxima aula da EBD.',
      'Atos apresenta a igreja em movimento, guiada pelo Espírito Santo e enviada para testemunhar de Cristo.',
      'Coordenação EBD',
      'draft',
      null,
      false
    )
)
insert into public.content_posts (
  company_id,
  category_id,
  type,
  title,
  slug,
  summary,
  content,
  author_name,
  status,
  published_at,
  send_push_notification
)
select
  c.id,
  cc.id,
  seed.type,
  seed.title,
  seed.slug,
  seed.summary,
  seed.content,
  seed.author_name,
  seed.status,
  seed.published_at,
  seed.send_push_notification
from target_company c
join seed on true
left join public.content_categories cc
  on cc.company_id = c.id
 and cc.slug = seed.category_slug
on conflict (company_id, slug) do update
set title = excluded.title,
    summary = excluded.summary,
    content = excluded.content,
    author_name = excluded.author_name,
    status = excluded.status,
    published_at = excluded.published_at,
    send_push_notification = excluded.send_push_notification,
    deleted_at = null,
    updated_at = now();

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
)
insert into public.banners (
  company_id,
  title,
  image_url,
  link_url,
  sort_order,
  is_active,
  show_in_apps,
  show_in_web
)
select
  c.id,
  'Bem-vindo ao EcclesiaHub',
  '',
  '/login',
  10,
  true,
  true,
  true
from target_company c
where not exists (
  select 1
  from public.banners b
  where b.company_id = c.id
    and lower(b.title) = lower('Bem-vindo ao EcclesiaHub')
    and b.deleted_at is null
);
