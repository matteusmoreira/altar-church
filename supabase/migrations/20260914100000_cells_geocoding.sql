-- Adiciona colunas de geolocalização e visibilidade pública para células
alter table public.groups
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists is_address_public boolean not null default true,
  add column if not exists cell_photo_url text;

comment on column public.groups.latitude is 'Latitude geográfica para renderização no mapa 3D';
comment on column public.groups.longitude is 'Longitude geográfica para renderização no mapa 3D';
comment on column public.groups.is_address_public is 'Se false, oculta o número e complemento residenciais na página pública para privacidade';
comment on column public.groups.cell_photo_url is 'URL opcional da foto da célula/grupo para exibição no modal';

create index if not exists groups_company_coordinates_idx
  on public.groups(company_id, latitude, longitude)
  where deleted_at is null and is_active = true and type = 'cell';

-- Policy para leitura pública de células ativas por anon
drop policy if exists "Active cells readable publicly" on public.groups;
create policy "Active cells readable publicly"
  on public.groups
  for select
  to anon
  using (
    type = 'cell'
    and is_active = true
    and deleted_at is null
    and exists (
      select 1
      from public.companies c
      where c.id = company_id
        and c.active = true
        and c.status = 'active'
    )
  );

grant select on public.groups to anon;
