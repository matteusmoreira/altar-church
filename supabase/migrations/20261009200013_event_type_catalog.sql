-- Existing church profile RLS continues to protect this tenant-owned catalog.
alter table public.church_profiles add column if not exists event_types text[] not null
  default array['service','prayer','youth','children','special','meeting'];
alter table public.church_profiles add constraint church_event_types_check
  check (cardinality(event_types) between 1 and 100);
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (char_length(btrim(type)) between 1 and 100);
-- Preserve larger bucket limits used by other modules.
update storage.buckets set file_size_limit = 20971520
where id = 'church-assets' and file_size_limit < 20971520;
