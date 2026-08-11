-- Operacao de escalas no workspace do ministerio usando as tabelas do Voluntariado.

create index if not exists volunteer_departments_company_ministry_idx
  on public.volunteer_departments(company_id, ministry_id, is_active)
  where ministry_id is not null and deleted_at is null;

create index if not exists volunteer_roles_department_name_idx
  on public.volunteer_department_roles(company_id, department_id, lower(name))
  where deleted_at is null;

create index if not exists volunteer_event_positions_company_event_idx
  on public.volunteer_event_positions(company_id, event_id, sort_order);

create index if not exists volunteer_shifts_company_event_idx
  on public.volunteer_shifts(company_id, event_id, starts_at);

create index if not exists ministry_memberships_active_person_idx
  on public.ministry_memberships(company_id, ministry_id, person_id)
  where status = 'active' and left_at is null;

-- Lideres e coordenadores do proprio ministerio podem operar o departamento
-- tecnico vinculado, sem receber permissao global de Voluntariado.
create or replace function public.can_manage_volunteer_department(target_department_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.volunteer_departments department
    where department.id = target_department_id and department.deleted_at is null
      and (
        public.can_manage_volunteer_company(department.company_id)
        or exists (
          select 1
          from public.volunteer_department_access access
          where access.department_id = department.id
            and access.profile_id = public.volunteer_current_profile_id()
        )
        or exists (
          select 1
          from public.profiles profile
          join public.ministry_memberships membership
            on membership.person_id = profile.person_id
           and membership.company_id = department.company_id
           and membership.ministry_id = department.ministry_id
           and membership.status = 'active'
           and membership.left_at is null
           and membership.role in ('leader', 'coordinator')
          where profile.id = public.volunteer_current_profile_id()
            and profile.company_id = department.company_id
            and profile.active
        )
      )
  )
$$;

-- A contagem anterior considerava ausencias do mesmo membro em qualquer
-- ministerio. O gatilho deve deduplicar somente dentro do ministerio do evento.
create or replace function public.create_ministry_absence_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ministry_id_value uuid;
  absence_count integer;
  source_key_value text;
begin
  if new.event_type <> 'ministry' or new.status <> 'absent'
     or new.person_id is null or new.event_ref_id is null then
    return new;
  end if;

  select event.ministry_id into ministry_id_value
  from public.events event
  where event.id = new.event_ref_id and event.company_id = new.company_id and event.deleted_at is null;
  if ministry_id_value is null then return new; end if;

  select count(*) into absence_count
  from public.attendance_records record
  join public.events event on event.id = record.event_ref_id
  where record.company_id = new.company_id
    and record.person_id = new.person_id
    and record.event_type = 'ministry'
    and record.status = 'absent'
    and record.deleted_at is null
    and event.company_id = new.company_id
    and event.ministry_id = ministry_id_value
    and record.occurred_on >= current_date - 30;
  if absence_count < 2 then return new; end if;

  source_key_value := 'ministry_absence:' || ministry_id_value::text || ':'
    || new.person_id::text || ':' || to_char(current_date, 'YYYY-MM');
  insert into public.person_follow_up_tasks (
    company_id, person_id, ministry_id, title, notes, due_at, priority, status, origin, source_key
  ) values (
    new.company_id, new.person_id, ministry_id_value,
    'Acompanhar ausencias no ministerio',
    'Pessoa teve duas ou mais ausencias nao justificadas nos ultimos 30 dias.',
    now() + interval '2 days', 'high', 'open', 'ministry_absence', source_key_value
  ) on conflict do nothing;
  return new;
end;
$$;

grant execute on function public.can_manage_volunteer_department(uuid) to authenticated;
