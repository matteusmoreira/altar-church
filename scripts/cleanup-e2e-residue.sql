-- Limpeza do residuo E2E no tenant de producao "Dignus Est".
-- Escopo estrito: company_id de Dignus Est + padroes documentados do harness E2E.
-- NUNCA toca no tenant de teste, nos auth.users e2e nem nos 2 ministerios reais.
--
-- Uso: mkdir -p backups/e2e-residue && psql -f scripts/cleanup-e2e-residue.sql
-- Antes de qualquer DELETE, exporta as linhas afetadas para backups/ (reversivel).

\set ON_ERROR_STOP on

\set dignus 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680'

\echo '############################################################'
\echo '# 1. ESTADO ANTES'
\echo '############################################################'

\echo '--- ministerios E2E em Dignus Est ---'
select count(*) as total, count(*) filter (where deleted_at is not null) as soft_deleted
from public.ministries
where company_id = :'dignus' and name ilike '%E2E%';

\echo '--- pessoas e2e em Dignus Est ---'
select count(*) as total, count(*) filter (where deleted_at is not null) as soft_deleted
from public.people
where company_id = :'dignus' and email ilike 'e2e.%@altar-church.test';

\echo '--- volunteer_profiles dessas pessoas ---'
select count(*) from public.volunteer_profiles
where person_id in (
  select id from public.people
  where company_id = :'dignus' and email ilike 'e2e.%@altar-church.test'
);

\echo '--- ministry_memberships desses ministerios ---'
select count(*) from public.ministry_memberships
where ministry_id in (
  select id from public.ministries
  where company_id = :'dignus' and name ilike '%E2E%'
);

\echo '--- congregations E2E em Dignus Est ---'
select count(*) from public.congregations
where company_id = :'dignus' and name ilike '%E2E%';

\echo '--- residuo de auth_rate_limits ---'
select count(*) from public.auth_rate_limits where key like 'auth.login.%' or key like 'auth.register.%';

\echo ''
\echo '############################################################'
\echo '# 2. BACKUP (CSV em backups/)'
\echo '############################################################'

\copy (select * from public.ministries where company_id = 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680' and name ilike '%E2E%') to 'backups/e2e-residue/ministries.csv' with csv header
\copy (select * from public.people where company_id = 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680' and email ilike 'e2e.%@altar-church.test') to 'backups/e2e-residue/people.csv' with csv header
\copy (select * from public.volunteer_profiles where person_id in (select id from public.people where company_id = 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680' and email ilike 'e2e.%@altar-church.test')) to 'backups/e2e-residue/volunteer_profiles.csv' with csv header
\copy (select * from public.ministry_memberships where ministry_id in (select id from public.ministries where company_id = 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680' and name ilike '%E2E%')) to 'backups/e2e-residue/ministry_memberships.csv' with csv header
\copy (select * from public.congregations where company_id = 'd2f5b9c0-029e-4d7d-9c8b-feb9de7e4680' and name ilike '%E2E%') to 'backups/e2e-residue/congregations.csv' with csv header
\copy (select * from public.auth_rate_limits where key like 'auth.login.%' or key like 'auth.register.%') to 'backups/e2e-residue/auth_rate_limits.csv' with csv header

\echo 'backups gravados em backups/e2e-residue/'

\echo ''
\echo '############################################################'
\echo '# 3. LIMPEZA'
\echo '############################################################'

begin;

-- 3a. Ministerio E2E: so os soft-deleted. Cascata remove os ministry_memberships.
with removidos as (
  delete from public.ministries
  where company_id = :'dignus'
    and name ilike '%E2E%'
    and deleted_at is not null
  returning id
)
select count(*) as ministerios_apagados from removidos;

-- 3b. Pessoas e2e: so as soft-deleted. Cascata remove volunteer_profiles.
with removidos as (
  delete from public.people
  where company_id = :'dignus'
    and email ilike 'e2e.%@altar-church.test'
    and deleted_at is not null
  returning id
)
select count(*) as pessoas_apagadas from removidos;

-- 3c. Congregation E2E (sem dependentes verificados).
with removidos as (
  delete from public.congregations
  where company_id = :'dignus'
    and name ilike '%E2E%'
  returning id
)
select count(*) as congregations_apagadas from removidos;

-- 3d. Residuo transitorio do rate limit (janelas ja expiradas).
with removidos as (
  delete from public.auth_rate_limits
  where key like 'auth.login.%' or key like 'auth.register.%'
  returning key
)
select count(*) as rate_limit_apagados from removidos;

commit;

\echo ''
\echo '############################################################'
\echo '# 4. ESTADO DEPOIS'
\echo '############################################################'

\echo '--- ministerios E2E em Dignus Est (esperado 0) ---'
select count(*) from public.ministries where company_id = :'dignus' and name ilike '%E2E%';

\echo '--- pessoas e2e em Dignus Est (esperado 0) ---'
select count(*) from public.people where company_id = :'dignus' and email ilike 'e2e.%@altar-church.test';

\echo '--- congregations E2E em Dignus Est (esperado 0) ---'
select count(*) from public.congregations where company_id = :'dignus' and name ilike '%E2E%';

\echo '--- rate limit (esperado 0) ---'
select count(*) from public.auth_rate_limits where key like 'auth.login.%' or key like 'auth.register.%';

\echo ''
\echo '--- INTEGRIDADE: o que deve ter permanecido ---'
\echo 'ministerios ativos de Dignus Est (esperado 2):'
select count(*) from public.ministries where company_id = :'dignus' and deleted_at is null;

\echo 'pessoas e2e VIVAS no tenant de teste (esperado 6):'
select count(*) from public.people p join public.companies c on c.id = p.company_id
where c.status = 'test' and p.email ilike 'e2e.%@altar-church.test';

\echo 'profiles e2e no tenant de teste (esperado 7):'
select count(*) from public.profiles pr join public.companies c on c.id = pr.company_id
where c.status = 'test' and pr.email ilike 'e2e.%@altar-church.test';

\echo 'auth.users e2e (esperado 8, intactos):'
select count(*) from auth.users where email ilike 'e2e.%@altar-church.test';

\echo 'ministerios E2E no tenant de teste (esperado 2, intactos):'
select count(*) from public.ministries m join public.companies c on c.id = m.company_id
where c.status = 'test' and m.name ilike '%E2E%';