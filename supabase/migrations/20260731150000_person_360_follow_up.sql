-- Fase 2: Pessoa 360, tarefas pastorais e gatilhos deduplicados.

create table if not exists public.person_follow_up_triggers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  trigger_kind text not null,
  name text not null,
  is_active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint person_follow_up_trigger_kind_check check (trigger_kind in (
    'new_visitor', 'visitor_without_contact', 'recurring_absence',
    'new_prayer_request', 'without_cell', 'without_portal_access'
  )),
  constraint person_follow_up_trigger_config_object_check check (jsonb_typeof(config) = 'object')
);

create unique index if not exists person_follow_up_triggers_company_kind_idx
  on public.person_follow_up_triggers(company_id, trigger_kind)
  where deleted_at is null;

create table if not exists public.person_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  crm_card_id uuid references public.crm_cards(id) on delete set null,
  title text not null,
  notes text not null default '',
  due_at timestamptz,
  priority text not null default 'normal',
  status text not null default 'open',
  origin text not null default 'manual',
  source_key text,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint person_follow_up_task_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint person_follow_up_task_status_check check (status in ('open', 'in_progress', 'completed', 'canceled')),
  constraint person_follow_up_task_origin_check check (origin in (
    'manual', 'new_visitor', 'visitor_without_contact', 'recurring_absence',
    'new_prayer_request', 'without_cell', 'without_portal_access'
  ))
);

create unique index if not exists person_follow_up_tasks_source_key_idx
  on public.person_follow_up_tasks(company_id, source_key)
  where source_key is not null and deleted_at is null;
create index if not exists person_follow_up_tasks_person_status_idx
  on public.person_follow_up_tasks(company_id, person_id, status, due_at)
  where deleted_at is null;
create index if not exists person_follow_up_tasks_responsible_idx
  on public.person_follow_up_tasks(company_id, responsible_profile_id, status, due_at)
  where deleted_at is null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['person_follow_up_triggers', 'person_follow_up_tasks'] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', table_name || '_set_updated_at', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_company_access', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_superadmin()) or (select public.is_company_member(company_id))) with check ((select public.is_superadmin()) or (select public.is_company_member(company_id)))',
      table_name || '_company_access', table_name
    );
  end loop;
end;
$$;

grant select, insert, update, delete on public.person_follow_up_triggers to authenticated;
grant select, insert, update, delete on public.person_follow_up_tasks to authenticated;

analyze public.person_follow_up_triggers;
analyze public.person_follow_up_tasks;
