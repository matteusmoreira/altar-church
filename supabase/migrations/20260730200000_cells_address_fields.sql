alter table public.groups
  add column if not exists postal_code text not null default '',
  add column if not exists address_number text not null default '',
  add column if not exists address_complement text not null default '',
  add column if not exists state text not null default '';

comment on column public.groups.meeting_location is 'Logradouro/endereco principal do encontro';
