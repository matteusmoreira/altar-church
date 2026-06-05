with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
)
insert into public.church_profiles (
  company_id,
  public_name,
  responsible_name,
  email,
  phone,
  address,
  city,
  state
)
select
  c.id,
  co.name,
  co.responsible_name,
  co.email,
  co.phone,
  co.address,
  co.city,
  co.state
from target_company c
join public.companies co on co.id = c.id
on conflict (company_id) do update
set public_name = excluded.public_name,
    responsible_name = excluded.responsible_name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    updated_at = now();

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(name, responsible, address) as (
  values
    ('Sede', 'Pastor João Silva', 'Rua das Flores, 123'),
    ('Congregação Vila Esperança', 'Maria Santos', 'Rua Esperança, 45'),
    ('Congregação Jardim das Oliveiras', 'Lucas Ferreira', 'Av. das Oliveiras, 890')
)
insert into public.congregations (company_id, name, responsible, address)
select c.id, seed.name, seed.responsible, seed.address
from target_company c
cross join seed
where not exists (
  select 1
  from public.congregations existing
  where existing.company_id = c.id
    and lower(existing.name) = lower(seed.name)
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(full_name, email, phone, birth_date, gender, congregation_name, status, person_type, baptized, email_validated, address, city, state) as (
  values
    ('João Silva', 'joao@email.com', '(11) 99999-1111', '1985-03-15'::date, 'male', 'Sede', 'active', 'member', true, true, 'Rua das Palmeiras, 100', 'São Paulo', 'SP'),
    ('João P. Silva', 'joao.p@email.com', '(11) 99999-1111', '1985-03-15'::date, 'male', 'Sede', 'active', 'member', true, true, 'Rua das Palmeiras, 102', 'São Paulo', 'SP'),
    ('Maria Santos', 'maria@email.com', '(11) 99999-2222', '1990-07-22'::date, 'female', 'Congregação Vila Esperança', 'active', 'leader', true, true, 'Rua Aurora, 25', 'São Paulo', 'SP'),
    ('Pedro Oliveira', 'pedro@email.com', '(11) 99999-3333', '1978-11-08'::date, 'male', 'Sede', 'active', 'member', true, false, 'Av. Central, 300', 'São Paulo', 'SP'),
    ('Ana Costa', 'ana@email.com', '(11) 99999-4444', '1995-05-30'::date, 'female', 'Congregação Jardim das Oliveiras', 'visitor', 'visitor', false, false, 'Rua das Acácias, 77', 'São Paulo', 'SP'),
    ('Lucas Ferreira', 'lucas@email.com', '(11) 99999-5555', '1988-09-12'::date, 'male', 'Congregação Jardim das Oliveiras', 'active', 'leader', true, true, 'Av. das Oliveiras, 900', 'São Paulo', 'SP'),
    ('Juliana Lima', 'juliana@email.com', '(11) 99999-6666', '1992-01-18'::date, 'female', 'Sede', 'active', 'volunteer', true, true, 'Rua Bom Pastor, 18', 'São Paulo', 'SP'),
    ('Carlos Mendes', 'carlos@email.com', '(11) 99999-7777', '1980-12-03'::date, 'male', 'Congregação Vila Esperança', 'inactive', 'attendee', false, false, 'Rua Nova, 48', 'São Paulo', 'SP')
),
prepared as (
  select
    c.id as company_id,
    cg.id as congregation_id,
    split_part(seed.full_name, ' ', 1) as first_name,
    trim(substr(seed.full_name, length(split_part(seed.full_name, ' ', 1)) + 1)) as last_name,
    seed.full_name,
    seed.email,
    seed.phone,
    seed.birth_date,
    seed.gender,
    seed.status,
    seed.person_type,
    seed.baptized,
    seed.email_validated,
    seed.address,
    seed.city,
    seed.state
  from target_company c
  join seed on true
  left join public.congregations cg
    on cg.company_id = c.id
   and lower(cg.name) = lower(seed.congregation_name)
)
insert into public.people (
  company_id,
  congregation_id,
  first_name,
  last_name,
  full_name,
  email,
  phone,
  birth_date,
  gender,
  status,
  person_type,
  baptized,
  email_validated,
  address,
  city,
  state
)
select
  company_id,
  congregation_id,
  first_name,
  last_name,
  full_name,
  email,
  phone,
  birth_date,
  gender,
  status,
  person_type,
  baptized,
  email_validated,
  address,
  city,
  state
from prepared
where not exists (
  select 1
  from public.people existing
  where existing.company_id = prepared.company_id
    and lower(coalesce(existing.email, '')) = lower(prepared.email)
    and existing.deleted_at is null
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(name, field_type, options, show_on_public_form, available_in_app, sort_order) as (
  values
    ('Como conheceu a igreja?', 'single', '["Indicação","Evento","Internet","Célula"]'::jsonb, true, true, 10),
    ('Pedido pastoral', 'text', '[]'::jsonb, true, false, 20),
    ('Data de conversão', 'date', '[]'::jsonb, false, true, 30)
)
insert into public.person_custom_fields (
  company_id,
  name,
  field_type,
  options,
  show_on_public_form,
  available_in_app,
  sort_order
)
select c.id, seed.name, seed.field_type, seed.options, seed.show_on_public_form, seed.available_in_app, seed.sort_order
from target_company c
cross join seed
where not exists (
  select 1
  from public.person_custom_fields existing
  where existing.company_id = c.id
    and lower(existing.name) = lower(seed.name)
    and existing.deleted_at is null
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(description, category) as (
  values
    ('Intercessão', 'pastoral'),
    ('Louvor vocal', 'worship'),
    ('Recepção', 'volunteer'),
    ('Liderança de célula', 'small_group'),
    ('Ensino bíblico', 'ministry')
)
insert into public.person_activities (company_id, description, category)
select c.id, seed.description, seed.category
from target_company c
cross join seed
where not exists (
  select 1
  from public.person_activities existing
  where existing.company_id = c.id
    and lower(existing.description) = lower(seed.description)
    and existing.deleted_at is null
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(name, description, sort_order) as (
  values
    ('Visitante', 'Primeiros contatos e acolhimento.', 10),
    ('Trilha de integração', 'Processo de integração de novos membros.', 20),
    ('Liderança', 'Formação e acompanhamento de líderes.', 30)
)
insert into public.member_journeys (company_id, name, description, sort_order)
select c.id, seed.name, seed.description, seed.sort_order
from target_company c
cross join seed
where not exists (
  select 1
  from public.member_journeys existing
  where existing.company_id = c.id
    and lower(existing.name) = lower(seed.name)
    and existing.deleted_at is null
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
seed(journey_name, step_name, description, sort_order) as (
  values
    ('Visitante', 'Primeira visita', 'Registro da primeira presença.', 10),
    ('Visitante', 'Contato pastoral', 'Contato de acolhimento realizado.', 20),
    ('Trilha de integração', 'Classe de integração', 'Participação na classe inicial.', 10),
    ('Trilha de integração', 'Batismo', 'Conclusão do marco de batismo.', 20),
    ('Liderança', 'Treinamento básico', 'Formação mínima para liderança.', 10)
)
insert into public.member_journey_steps (company_id, journey_id, name, description, sort_order)
select c.id, j.id, seed.step_name, seed.description, seed.sort_order
from target_company c
join seed on true
join public.member_journeys j
  on j.company_id = c.id
 and lower(j.name) = lower(seed.journey_name)
where not exists (
  select 1
  from public.member_journey_steps existing
  where existing.company_id = c.id
    and existing.journey_id = j.id
    and lower(existing.name) = lower(seed.step_name)
    and existing.deleted_at is null
);

with target_company as (
  select id
  from public.companies
  where legacy_id = 'c1'
  limit 1
),
pairs as (
  select
    c.id as company_id,
    p1.id as primary_person_id,
    p2.id as duplicate_person_id
  from target_company c
  join public.people p1 on p1.company_id = c.id and lower(p1.email) = 'joao@email.com'
  join public.people p2 on p2.company_id = c.id and lower(p2.email) = 'joao.p@email.com'
)
insert into public.duplicate_candidates (
  company_id,
  primary_person_id,
  duplicate_person_id,
  reason,
  similarity_score
)
select
  company_id,
  primary_person_id,
  duplicate_person_id,
  'Telefone igual e nome semelhante',
  92
from pairs
where not exists (
  select 1
  from public.duplicate_candidates existing
  where existing.company_id = pairs.company_id
    and existing.primary_person_id = pairs.primary_person_id
    and existing.duplicate_person_id = pairs.duplicate_person_id
);

update public.companies c
set member_count = counts.total
from (
  select company_id, count(*)::integer as total
  from public.people
  where deleted_at is null
    and is_active = true
    and status <> 'visitor'
  group by company_id
) counts
where c.id = counts.company_id;
