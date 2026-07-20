-- Programacoes como fonte da serie; eventos como ocorrencias operacionais.

alter table public.programmings
  add column if not exists kind text not null default 'service',
  add column if not exists location text not null default '',
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists recurrence_frequency text not null default 'none',
  add column if not exists recurrence_weekdays smallint[] not null default '{}',
  add column if not exists recurrence_until date,
  add column if not exists recurrence_needs_review boolean not null default false,
  add column if not exists volunteer_template_id uuid references public.volunteer_schedule_templates(id) on delete set null,
  add column if not exists source_event_id uuid references public.events(id) on delete set null;

update public.programmings
set recurrence_needs_review = true,
    recurrence_frequency = 'none'
where is_recurring
  and btrim(recurrence_rule) = ''
  and recurrence_frequency = 'none';

alter table public.programmings drop constraint if exists programmings_kind_check;
alter table public.programmings add constraint programmings_kind_check
  check (kind in ('service', 'cleaning', 'rehearsal', 'meeting', 'outreach', 'other'));
alter table public.programmings drop constraint if exists programmings_recurrence_frequency_check;
alter table public.programmings add constraint programmings_recurrence_frequency_check
  check (recurrence_frequency in ('none', 'weekly', 'monthly'));
alter table public.programmings drop constraint if exists programmings_recurrence_weekdays_check;
alter table public.programmings add constraint programmings_recurrence_weekdays_check
  check (recurrence_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);

alter table public.volunteer_schedule_templates
  add column if not exists owner_programming_id uuid references public.programmings(id) on delete cascade;

create unique index if not exists volunteer_templates_owner_programming_unique
  on public.volunteer_schedule_templates(owner_programming_id)
  where owner_programming_id is not null;

alter table public.events
  add column if not exists programming_id uuid references public.programmings(id) on delete set null;

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('service', 'prayer', 'youth', 'children', 'special', 'meeting', 'cleaning', 'rehearsal', 'outreach', 'other'));

create unique index if not exists events_programming_occurrence_unique
  on public.events(programming_id, starts_at)
  where programming_id is not null and deleted_at is null;
create unique index if not exists programmings_source_event_unique
  on public.programmings(source_event_id)
  where source_event_id is not null;
create index if not exists programmings_company_recurrence_idx
  on public.programmings(company_id, is_active, recurrence_frequency, starts_at)
  where deleted_at is null;
create index if not exists events_programming_month_idx
  on public.events(programming_id, starts_at)
  where deleted_at is null;

-- Preserva eventos existentes criando uma programacao unica para cada um.
do $$
declare
  event_row record;
  generated_programming_id uuid;
begin
  for event_row in
    select event.*
    from public.events event
    where event.deleted_at is null and event.programming_id is null
    order by event.created_at, event.id
  loop
    insert into public.programmings (
      company_id, title, description, starts_at, duration_minutes,
      is_recurring, recurrence_rule, kind, location, timezone,
      recurrence_frequency, is_active, source_event_id, volunteer_template_id,
      created_by, updated_by, created_at, updated_at
    ) values (
      event_row.company_id, event_row.title, event_row.description, event_row.starts_at,
      greatest(1, coalesce(round(extract(epoch from (event_row.ends_at - event_row.starts_at)) / 60)::integer, 60)),
      false, '',
      case when event_row.type in ('service', 'cleaning', 'rehearsal', 'meeting', 'outreach', 'other') then event_row.type else 'other' end,
      event_row.location, 'America/Sao_Paulo', 'none', event_row.status <> 'cancelled',
      event_row.id, event_row.volunteer_template_id,
      event_row.created_by, event_row.updated_by, event_row.created_at, event_row.updated_at
    )
    on conflict (source_event_id) where source_event_id is not null
    do update set updated_at = excluded.updated_at
    returning id into generated_programming_id;

    update public.events
    set programming_id = generated_programming_id
    where id = event_row.id;
  end loop;
end
$$;

create or replace function public.materialize_volunteer_programmings(
  target_company_id uuid default null,
  horizon_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  programming_row record;
  occurrence_date date;
  occurrence_start timestamptz;
  occurrence_end timestamptz;
  occurrence_id uuid;
  local_start timestamp;
  generated integer := 0;
  from_date date;
  through_date date;
begin
  if horizon_days < 1 or horizon_days > 366 then
    raise exception 'Horizonte deve estar entre 1 e 366 dias';
  end if;

  for programming_row in
    select programming.*
    from public.programmings programming
    where programming.deleted_at is null
      and programming.is_active
      and programming.starts_at is not null
      and not programming.recurrence_needs_review
      and (target_company_id is null or programming.company_id = target_company_id)
  loop
    local_start := programming_row.starts_at at time zone programming_row.timezone;
    from_date := greatest(local_start::date, (now() at time zone programming_row.timezone)::date);
    through_date := least(
      (now() at time zone programming_row.timezone)::date + horizon_days,
      coalesce(programming_row.recurrence_until, 'infinity'::date)
    );

    for occurrence_date in
      select candidate::date
      from generate_series(
        case when programming_row.recurrence_frequency = 'none' then local_start::date else from_date end,
        case when programming_row.recurrence_frequency = 'none' then local_start::date else through_date end,
        interval '1 day'
      ) candidate
      where
        programming_row.recurrence_frequency = 'none'
        or (
          programming_row.recurrence_frequency = 'weekly'
          and extract(dow from candidate)::smallint = any(programming_row.recurrence_weekdays)
        )
        or (
          programming_row.recurrence_frequency = 'monthly'
          and extract(day from candidate) = extract(day from local_start)
        )
    loop
      occurrence_start := timezone(
        programming_row.timezone,
        occurrence_date::timestamp + local_start::time
      );
      occurrence_end := occurrence_start + make_interval(mins => programming_row.duration_minutes);

      insert into public.events (
        company_id, programming_id, title, description, type, starts_at, ends_at,
        location, is_public, status, recurring, volunteer_template_id,
        created_by, updated_by
      ) values (
        programming_row.company_id, programming_row.id, programming_row.title,
        programming_row.description, programming_row.kind, occurrence_start, occurrence_end,
        programming_row.location, true, 'published',
        programming_row.recurrence_frequency <> 'none', programming_row.volunteer_template_id,
        programming_row.created_by, programming_row.updated_by
      )
      on conflict (programming_id, starts_at) where programming_id is not null and deleted_at is null
      do update set
        title = excluded.title,
        description = excluded.description,
        type = excluded.type,
        ends_at = excluded.ends_at,
        location = excluded.location,
        volunteer_template_id = excluded.volunteer_template_id,
        updated_by = excluded.updated_by,
        updated_at = now()
      where public.events.volunteer_schedule_published_at is null
      returning id into occurrence_id;

      if occurrence_id is null then
        select id into occurrence_id
        from public.events
        where programming_id = programming_row.id
          and starts_at = occurrence_start
          and deleted_at is null;
      else
        generated := generated + 1;
      end if;

      if occurrence_id is not null
        and programming_row.volunteer_template_id is not null
        and not exists (
          select 1 from public.events event
          where event.id = occurrence_id and event.volunteer_schedule_published_at is not null
        )
      then
        insert into public.volunteer_event_positions (
          company_id, event_id, department_id, role_id, role_name,
          required_volunteers, instructions, sort_order,
          created_by, updated_by
        )
        select
          slot.company_id, occurrence_id, slot.department_id, slot.role_id, slot.role_name,
          slot.required_volunteers, slot.instructions, slot.sort_order,
          programming_row.created_by, programming_row.updated_by
        from public.volunteer_schedule_template_slots slot
        where slot.template_id = programming_row.volunteer_template_id
          and slot.role_id is not null
        on conflict (event_id, department_id, role_id)
        do update set
          role_name = excluded.role_name,
          required_volunteers = excluded.required_volunteers,
          instructions = excluded.instructions,
          sort_order = excluded.sort_order,
          updated_by = excluded.updated_by,
          updated_at = now();
      end if;
    end loop;
  end loop;

  return generated;
end
$$;

revoke all on function public.materialize_volunteer_programmings(uuid, integer) from public, anon, authenticated;
grant execute on function public.materialize_volunteer_programmings(uuid, integer) to service_role;

-- Job diario. Criacao/edicao tambem chama a funcao imediatamente.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'volunteer-programmings-daily';

    perform cron.schedule(
      'volunteer-programmings-daily',
      '15 5 * * *',
      'select public.materialize_volunteer_programmings(null, 90)'
    );
  end if;
exception
  when insufficient_privilege or undefined_table or undefined_function then
    raise notice 'pg_cron indisponivel; materializacao imediata continua ativa';
end
$$;

select public.materialize_volunteer_programmings(null, 90);
