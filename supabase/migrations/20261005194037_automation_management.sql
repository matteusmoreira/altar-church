create table public.automation_templates (
 company_id uuid not null references public.companies(id), template_id text not null,
 name text not null, definition jsonb not null, revision integer not null default 1,
 deleted_at timestamptz, updated_at timestamptz not null default now(),
 primary key(company_id,template_id)
);
alter table public.automation_templates enable row level security;
revoke all on public.automation_templates from anon,authenticated;
grant select on public.automation_templates to authenticated;
grant all on public.automation_templates to service_role;
create policy automation_read on public.automation_templates for select to authenticated
 using(public.automation_can_view(company_id));

-- Keep execution keys and delivery receipts for deduplication after clearing the UI history.
alter table public.automation_runs add column history_cleared_at timestamptz;
