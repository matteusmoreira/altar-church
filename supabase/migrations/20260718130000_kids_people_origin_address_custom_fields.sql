-- Kids: origem derivada em Pessoas, endereço familiar e campos configuráveis.

alter table public.people
  add column if not exists postal_code text not null default '',
  add column if not exists address_number text not null default '',
  add column if not exists address_complement text not null default '',
  add column if not exists neighborhood text not null default '';

alter table public.person_custom_fields
  add column if not exists source_module text not null default 'people',
  add column if not exists kids_targets text[] not null default '{}'::text[],
  add column if not exists show_in_kids_internal boolean not null default false,
  add column if not exists show_in_kids_public boolean not null default false,
  add column if not exists show_in_kids_portal boolean not null default false,
  add column if not exists is_required boolean not null default false;

alter table public.person_custom_fields
  drop constraint if exists person_custom_fields_type_check;

alter table public.person_custom_fields
  add constraint person_custom_fields_type_check
    check (field_type in ('text', 'textarea', 'number', 'date', 'single', 'multiple', 'boolean')),
  add constraint person_custom_fields_source_module_check
    check (source_module in ('people', 'kids')),
  add constraint person_custom_fields_kids_targets_check
    check (kids_targets <@ array['child', 'guardian']::text[]);

create index if not exists person_custom_fields_kids_active_idx
  on public.person_custom_fields(company_id, source_module, sort_order)
  where deleted_at is null and is_active = true;

create index if not exists kid_guardians_company_person_active_idx
  on public.kid_guardians(company_id, person_id)
  where deleted_at is null;

