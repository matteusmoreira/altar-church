-- Fase 3 (auditoria 29/09/2026): UNIQUEs nao-parciais bloqueiam recriacao apos soft-delete;
-- profiles.email unico global trava onboarding multi-igreja; falta indice donations(company_id,status).
-- Idempotente e seguro: so cria o parcial depois de checar duplicatas ativas.

-- 1. volunteer_profiles(person_id) -> parcial WHERE deleted_at IS NULL
do $$
begin
  if exists (
    select 1 from public.volunteer_profiles
    where deleted_at is null
    group by person_id having count(*) > 1
  ) then
    raise notice 'volunteer_profiles: duplicatas ativas em person_id, parcial nao criado';
  else
    alter table public.volunteer_profiles drop constraint if exists volunteer_profiles_person_unique;
    create unique index if not exists volunteer_profiles_person_active_unique
      on public.volunteer_profiles (person_id) where deleted_at is null;
  end if;
end $$;

-- 2. member_event_rsvps(event_id, person_id) -> parcial WHERE status <> 'canceled'
-- (cancelado nao e soft-delete com deleted_at; recriar apos cancelar deve ser permitido)
do $$
begin
  if exists (
    select 1 from public.member_event_rsvps
    where status <> 'canceled'
    group by event_id, person_id having count(*) > 1
  ) then
    raise notice 'member_event_rsvps: duplicatas ativas, parcial nao criado';
  else
    alter table public.member_event_rsvps drop constraint if exists member_event_rsvp_unique;
    create unique index if not exists member_event_rsvps_event_person_active_unique
      on public.member_event_rsvps (event_id, person_id) where status <> 'canceled';
  end if;
end $$;

-- 3. profiles.email: global -> por (company_id, lower(email)) para linhas ativas.
-- Nao remove o UNIQUE global automaticamente (operacao destrutiva em prod);
-- cria o parcial e documenta: o global so pode cair apos dedupe manual.
create unique index if not exists profiles_company_email_active_unique
  on public.profiles (company_id, lower(email)) where active = true;

-- 4. materialize_volunteer_programmings: timestamp sem tz -> timestamptz
-- (conversao via DO com checagem de tipo; re-execucao segura)
do $$
begin
  if exists (
    select 1 from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'materialize_volunteer_programmings%'
      and data_type = 'timestamp without time zone'
  ) then
    raise notice 'materialize_volunteer_programmings: assinatura com timestamp sem tz detectada; converter manualmente em janela (nao automatizado por risco de mudanca de semantica).';
  end if;
end $$;

-- 5. donations(company_id, status): filtro de status sem indice dedicado
create index if not exists donations_company_status_idx
  on public.donations (company_id, status) where deleted_at is null;
