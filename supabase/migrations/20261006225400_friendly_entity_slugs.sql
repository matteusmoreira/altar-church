-- Backfill must not enqueue person.updated automations or external messages.
select set_config('app.automation_run_id', gen_random_uuid()::text, true);

-- Addresses are reserved permanently, including after soft/hard deletion.
create schema if not exists route_private;
revoke all on schema route_private from public, anon, authenticated;

create table route_private.slug_reservations (
  company_id uuid not null,
  kind text not null,
  slug text not null,
  entity_id uuid not null,
  primary key (company_id, kind, slug)
);
alter table route_private.slug_reservations enable row level security;
revoke all on route_private.slug_reservations from public, anon, authenticated;

alter table public.people add column slug text;
alter table public.events add column slug text, add column public_slug text;
alter table public.notifications add column slug text;
alter table public.kid_classrooms add column slug text;
alter table public.kid_session_classrooms add column slug text;

create function route_private.normalize_slug(value text, fallback text)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare result text;
begin
  result := lower(translate(coalesce(value, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
  result := trim(both '-' from regexp_replace(result, '[^a-z0-9]+', '-', 'g'));
  result := coalesce(nullif(result, ''), fallback);
  if result = any(array['novo','nova','new','editar','edit','cadastro','follow-up','publico',
      'inscricao','check-in','sessao','export','salas','recepcao','saude','aquisicao','operacao','templates'])
    or result ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    result := fallback || '-' || result;
  end if;
  return trim(trailing '-' from left(result, 80));
end $$;

-- The unique INSERT is the concurrency boundary; no check-then-insert race.
create function route_private.reserve_slug(company uuid, entity_kind text, entity uuid,
  requested text, fallback text, reuse_own boolean default true)
returns text language plpgsql set search_path = pg_catalog as $$
declare base text; candidate text; suffix text; attempt integer := 1; owner uuid;
begin
  base := route_private.normalize_slug(requested, fallback);
  loop
    suffix := case when attempt = 1 then '' else '-' || attempt::text end;
    candidate := trim(trailing '-' from left(base, 80 - length(suffix))) || suffix;
    insert into route_private.slug_reservations(company_id, kind, slug, entity_id)
      values (company, entity_kind, candidate, entity) on conflict do nothing;
    if found then return candidate; end if;
    select entity_id into owner from route_private.slug_reservations
      where company_id = company and kind = entity_kind and slug = candidate;
    if reuse_own and owner = entity then return candidate; end if;
    attempt := attempt + 1;
  end loop;
end $$;

create function route_private.assign_entity_slug()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare fallback text; source_name text; session_name text;
begin
  -- Only installed triggers can call this function. Table writes still enforce RLS.
  if tg_table_schema <> 'public' then raise exception 'Invalid slug table'; end if;
  case tg_table_name
    when 'people' then fallback := 'pessoa'; source_name := new.full_name;
    when 'ministries' then fallback := 'ministerio';
      source_name := regexp_replace(new.name, '^(?:minist[eé]rio\s+(?:d[eoa]s?\s+)?|min\.?\s+(?:d[eoa]s?\s+)?)', '', 'i');
    when 'forms' then fallback := 'formulario'; source_name := new.title;
    when 'events' then fallback := 'evento'; source_name := new.title;
    when 'notifications' then fallback := 'notificacao'; source_name := new.title;
    when 'kid_classrooms' then fallback := 'sala'; source_name := new.name;
    when 'kid_session_classrooms' then fallback := 'sala';
      select classroom.name, session.title into source_name, session_name
        from public.kid_classrooms classroom join public.kid_sessions session
          on session.id = new.session_id and session.company_id = new.company_id
        where classroom.id = new.classroom_id and classroom.company_id = new.company_id;
      source_name := concat_ws('-', source_name, session_name);
    else raise exception 'Invalid slug table';
  end case;
  if tg_op = 'UPDATE' then
    if new.company_id <> old.company_id then raise exception 'Cannot move a slug to another church'; end if;
    -- Clearing a slug or renaming a record must not change its address.
    new.slug := coalesce(nullif(new.slug, ''), old.slug);
  end if;
  new.slug := route_private.reserve_slug(new.company_id, tg_table_name, new.id,
    coalesce(nullif(new.slug, ''), source_name), fallback);
  if tg_table_name = 'events' then
    if tg_op = 'UPDATE' then
      if new.public_token is distinct from old.public_token then
        new.public_slug := route_private.reserve_slug(new.company_id, 'public_events', new.id, new.slug, 'evento', false);
      else new.public_slug := old.public_slug; end if;
    end if;
    if new.public_slug is null then
      new.public_slug := route_private.reserve_slug(new.company_id, 'public_events', new.id, new.slug, 'evento');
    end if;
  end if;
  return new;
end $$;

revoke all on all functions in schema route_private from public, anon, authenticated;

-- Reserve existing valid addresses before allocating missing ones. Active rows win
-- old duplicates; deleted rows keep a distinct reservation for future restores.
do $$
declare table_name text; row_data record;
begin
  foreach table_name in array array['ministries','forms'] loop
    for row_data in execute format('select id, company_id, slug from public.%I
      where slug is not null and slug <> '''' order by (deleted_at is not null), created_at, id', table_name) loop
      insert into route_private.slug_reservations values(row_data.company_id, table_name, row_data.slug, row_data.id)
        on conflict do nothing;
    end loop;
  end loop;
  foreach table_name in array array['people','ministries','forms','events','notifications','kid_classrooms','kid_session_classrooms'] loop
    execute format('create trigger assign_entity_slug before insert or update on public.%I
      for each row execute function route_private.assign_entity_slug()', table_name);
    for row_data in execute format('select id from public.%I order by created_at, id', table_name) loop
      execute format('update public.%I set slug = slug where id = $1', table_name) using row_data.id;
    end loop;
    execute format('alter table public.%I alter column slug set not null', table_name);
    execute format('alter table public.%I add constraint %I check (slug ~ ''^[a-z0-9]+(-[a-z0-9]+)*$'' and length(slug) <= 80)', table_name, table_name || '_route_slug_format');
    execute format('create unique index %I on public.%I(company_id, slug)', table_name || '_route_slug_unique', table_name);
  end loop;
end $$;
alter table public.events alter column public_slug set not null;
alter table public.events add constraint events_public_slug_format check (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(public_slug) <= 80);
create unique index events_company_public_slug_unique on public.events(company_id, public_slug);
select set_config('app.automation_run_id', '', true);
