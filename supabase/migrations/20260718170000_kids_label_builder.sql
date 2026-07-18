-- Kids label builder: tenant templates, immutable revisions and attendance binding.

create table if not exists public.kid_label_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  congregation_id uuid references public.congregations(id) on delete cascade,
  kind text not null,
  name text not null,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_label_templates_kind_check check (kind in ('child', 'guardian')),
  constraint kid_label_templates_name_check check (char_length(btrim(name)) between 2 and 120)
);

create unique index if not exists kid_label_templates_active_scope_idx
  on public.kid_label_templates (
    company_id,
    coalesce(congregation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind
  )
  where is_active and deleted_at is null;
create index if not exists kid_label_templates_company_idx
  on public.kid_label_templates(company_id, congregation_id, kind)
  where deleted_at is null;

create table if not exists public.kid_label_template_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.kid_label_templates(id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  schema_version integer not null default 1,
  width_mm numeric(8,2) not null,
  height_mm numeric(8,2) not null,
  dpi integer not null default 203,
  design jsonb not null,
  contains_sensitive_fields boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint kid_label_template_revisions_status_check check (status in ('draft', 'published', 'superseded')),
  constraint kid_label_template_revisions_dimensions_check check (width_mm between 20 and 297 and height_mm between 15 and 420),
  constraint kid_label_template_revisions_dpi_check check (dpi in (203, 300, 600)),
  constraint kid_label_template_revisions_version_unique unique (template_id, version)
);

create index if not exists kid_label_revisions_template_idx
  on public.kid_label_template_revisions(template_id, version desc);

alter table public.kid_label_templates
  add column if not exists draft_revision_id uuid references public.kid_label_template_revisions(id) on delete set null,
  add column if not exists published_revision_id uuid references public.kid_label_template_revisions(id) on delete set null;

alter table public.kid_attendances
  add column if not exists child_label_revision_id uuid references public.kid_label_template_revisions(id) on delete set null,
  add column if not exists guardian_label_revision_id uuid references public.kid_label_template_revisions(id) on delete set null;

-- Existing Kids tenants receive an immediately usable visual equivalent.
do $$
declare
  tenant record;
  label_kind text;
  template_id uuid;
  revision_id uuid;
  design_json jsonb;
begin
  for tenant in
    select distinct company_id from public.kid_settings
    union
    select distinct company_id from public.kid_profiles
  loop
    foreach label_kind in array array['child', 'guardian'] loop
      if not exists (
        select 1 from public.kid_label_templates
        where company_id = tenant.company_id and congregation_id is null and kind = label_kind and deleted_at is null
      ) then
        insert into public.kid_label_templates (company_id, kind, name, is_active)
        values (tenant.company_id, label_kind, case when label_kind = 'child' then 'Etiqueta da criança' else 'Etiqueta do responsável' end, true)
        returning id into template_id;

        design_json := case when label_kind = 'child' then
          '{"schemaVersion":1,"backgroundColor":"#ffffff","backgroundGradientFrom":null,"backgroundGradientTo":null,"backgroundGradientAngle":0,"backgroundAssetId":null,"backgroundFit":"cover","showGrid":true,"snapToGrid":true,"gridSizeMm":2,"bleedMm":1,"elements":[{"id":"child-name","type":"field","name":"Nome","x":4,"y":4,"width":37,"height":9,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":0,"field":"childName","fontFamily":"Arial","fontSize":7,"fontWeight":800,"textAlign":"left","letterSpacing":0,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"child-room","type":"field","name":"Sala","x":4,"y":14,"width":37,"height":6,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":1,"field":"classroomName","fontFamily":"Arial","fontSize":4.2,"fontWeight":600,"textAlign":"left","letterSpacing":0,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"child-pin","type":"field","name":"PIN","x":4,"y":31,"width":37,"height":7,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":2,"field":"pickupCode","fontFamily":"Arial","fontSize":5,"fontWeight":800,"textAlign":"left","letterSpacing":1.2,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"child-qr","type":"qr","name":"QR","x":43,"y":5,"width":15,"height":15,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":3}]}'::jsonb
        else
          '{"schemaVersion":1,"backgroundColor":"#ffffff","backgroundGradientFrom":null,"backgroundGradientTo":null,"backgroundGradientAngle":0,"backgroundAssetId":null,"backgroundFit":"cover","showGrid":true,"snapToGrid":true,"gridSizeMm":2,"bleedMm":1,"elements":[{"id":"guardian-title","type":"text","name":"Título","x":4,"y":3,"width":36,"height":5,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":0,"text":"RETIRADA","fontFamily":"Arial","fontSize":3.2,"fontWeight":700,"textAlign":"left","letterSpacing":0,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"guardian-child","type":"field","name":"Criança","x":4,"y":9,"width":36,"height":8,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":1,"field":"childName","fontFamily":"Arial","fontSize":5.5,"fontWeight":700,"textAlign":"left","letterSpacing":0,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"guardian-pin","type":"field","name":"PIN","x":4,"y":20,"width":34,"height":12,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":2,"field":"pickupCode","fontFamily":"Arial","fontSize":8,"fontWeight":800,"textAlign":"left","letterSpacing":2,"color":"#111111","fill":"transparent","stroke":"transparent","strokeWidth":0,"radius":0,"shadowColor":"transparent","shadowBlur":0},{"id":"guardian-qr","type":"qr","name":"QR","x":43,"y":5,"width":15,"height":15,"rotation":0,"opacity":1,"visible":true,"locked":false,"zIndex":3}]}'::jsonb
        end;

        insert into public.kid_label_template_revisions (
          company_id, template_id, version, status, width_mm, height_mm, dpi, design, published_at
        ) values (tenant.company_id, template_id, 1, 'published', 62, 40, 203, design_json, now())
        returning id into revision_id;

        update public.kid_label_templates
        set draft_revision_id = revision_id, published_revision_id = revision_id
        where id = template_id;
      end if;
    end loop;
  end loop;
end $$;

alter table public.kid_label_templates enable row level security;
alter table public.kid_label_template_revisions enable row level security;

drop policy if exists "kid_label_templates staff access" on public.kid_label_templates;
create policy "kid_label_templates staff access"
on public.kid_label_templates for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff())))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff())));

drop policy if exists "kid_label_template_revisions staff access" on public.kid_label_template_revisions;
create policy "kid_label_template_revisions staff access"
on public.kid_label_template_revisions for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff())))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_is_staff())));

grant select, insert, update, delete on public.kid_label_templates to authenticated;
grant select, insert, update, delete on public.kid_label_template_revisions to authenticated;

drop trigger if exists kid_label_templates_set_updated_at on public.kid_label_templates;
create trigger kid_label_templates_set_updated_at
before update on public.kid_label_templates
for each row execute function public.set_updated_at();
