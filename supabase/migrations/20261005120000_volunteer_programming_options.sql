-- Catalogs belong to the church; removing a choice preserves historical schedules.
alter table public.volunteer_module_settings
  add column if not exists programming_kinds text[] not null default array['service','cleaning','rehearsal','meeting','outreach','other'],
  add column if not exists programming_locations text[] not null default '{}';

insert into public.volunteer_module_settings(company_id)
select id from public.companies on conflict (company_id) do nothing;

update public.volunteer_module_settings settings
set programming_locations = array(
  select distinct btrim(location) from public.programmings
  where company_id = settings.company_id and deleted_at is null and btrim(location) <> ''
  order by btrim(location)
)
where cardinality(programming_locations) = 0;

alter table public.programmings drop constraint if exists programmings_kind_check;
alter table public.programmings add constraint programmings_kind_check
  check (char_length(btrim(kind)) between 1 and 100);

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('service','prayer','youth','children','special','meeting','cleaning','rehearsal','outreach','other')
    or (programming_id is not null and char_length(btrim(type)) between 1 and 100));
