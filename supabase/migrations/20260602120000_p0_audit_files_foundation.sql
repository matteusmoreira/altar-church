create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint audit_logs_action_format check (action ~ '^[a-z0-9_.:-]+$'),
  constraint audit_logs_entity_table_format check (entity_table ~ '^[a-z0-9_.-]+$')
);

create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bucket text not null default 'church-assets',
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  visibility text not null default 'private',
  owner_profile_id uuid references public.profiles(id) on delete set null,
  entity_table text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint app_files_storage_path_unique unique (bucket, storage_path),
  constraint app_files_storage_path_company_prefix check (storage_path like company_id::text || '/%'),
  constraint app_files_size_check check (size_bytes >= 0),
  constraint app_files_visibility_check check (visibility in ('private', 'public')),
  constraint app_files_entity_table_format check (entity_table is null or entity_table ~ '^[a-z0-9_.-]+$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'church-assets',
  'church-assets',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create index if not exists audit_logs_company_id_created_at_idx
on public.audit_logs(company_id, created_at desc);

create index if not exists audit_logs_actor_profile_id_created_at_idx
on public.audit_logs(actor_profile_id, created_at desc);

create index if not exists audit_logs_entity_idx
on public.audit_logs(entity_table, entity_id);

create index if not exists app_files_company_id_created_at_idx
on public.app_files(company_id, created_at desc);

create index if not exists app_files_owner_profile_id_idx
on public.app_files(owner_profile_id);

create index if not exists app_files_entity_idx
on public.app_files(entity_table, entity_id)
where entity_table is not null;

drop trigger if exists app_files_set_updated_at on public.app_files;
create trigger app_files_set_updated_at
before update on public.app_files
for each row execute function public.set_updated_at();

alter table public.audit_logs enable row level security;
alter table public.app_files enable row level security;

drop policy if exists "Audit logs are readable by company" on public.audit_logs;
create policy "Audit logs are readable by company"
on public.audit_logs
for select
to authenticated
using (
  (select public.is_superadmin())
  or (company_id is not null and (select public.is_company_member(company_id)))
);

drop policy if exists "Audit logs are append only by company" on public.audit_logs;
create policy "Audit logs are append only by company"
on public.audit_logs
for insert
to authenticated
with check (
  (select public.is_superadmin())
  or (company_id is not null and (select public.is_company_member(company_id)))
);

drop policy if exists "App files are readable by company" on public.app_files;
create policy "App files are readable by company"
on public.app_files
for select
to authenticated
using (
  (select public.is_superadmin())
  or (select public.is_company_member(company_id))
);

drop policy if exists "App files are inserted by company" on public.app_files;
create policy "App files are inserted by company"
on public.app_files
for insert
to authenticated
with check (
  (select public.is_superadmin())
  or (select public.is_company_member(company_id))
);

drop policy if exists "App files are updated by company" on public.app_files;
create policy "App files are updated by company"
on public.app_files
for update
to authenticated
using (
  (select public.is_superadmin())
  or (select public.is_company_member(company_id))
)
with check (
  (select public.is_superadmin())
  or (select public.is_company_member(company_id))
);

drop policy if exists "App files are deleted by company" on public.app_files;
create policy "App files are deleted by company"
on public.app_files
for delete
to authenticated
using (
  (select public.is_superadmin())
  or (select public.is_company_member(company_id))
);

grant select, insert on public.audit_logs to authenticated;
grant select, insert, update, delete on public.app_files to authenticated;

drop policy if exists "Church assets readable by company" on storage.objects;
create policy "Church assets readable by company"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'church-assets'
  and exists (
    select 1
    from public.app_files f
    where f.bucket = storage.objects.bucket_id
      and f.storage_path = storage.objects.name
      and f.is_active = true
      and f.deleted_at is null
      and (
        (select public.is_superadmin())
        or (select public.is_company_member(f.company_id))
      )
  )
);

drop policy if exists "Church assets inserted by company" on storage.objects;
create policy "Church assets inserted by company"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'church-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    (select public.is_superadmin())
    or (select public.is_company_member(split_part(name, '/', 1)::uuid))
  )
);

drop policy if exists "Church assets updated by company" on storage.objects;
create policy "Church assets updated by company"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'church-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    (select public.is_superadmin())
    or (select public.is_company_member(split_part(name, '/', 1)::uuid))
  )
)
with check (
  bucket_id = 'church-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    (select public.is_superadmin())
    or (select public.is_company_member(split_part(name, '/', 1)::uuid))
  )
);

drop policy if exists "Church assets deleted by company" on storage.objects;
create policy "Church assets deleted by company"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'church-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    (select public.is_superadmin())
    or (select public.is_company_member(split_part(name, '/', 1)::uuid))
  )
);
