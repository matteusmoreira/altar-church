-- Persistent automation engine. No flow is enabled by this migration.
alter table public.people add column if not exists baptism_date date;
alter table public.groups add column if not exists automation_whatsapp_chat_id text;
alter table public.groups add constraint groups_automation_chat_check check (automation_whatsapp_chat_id is null or automation_whatsapp_chat_id ~ '^\d+(-\d+)?@g\.us$');

create table public.automation_settings (
 company_id uuid primary key references public.companies(id), timezone text not null default 'America/Sao_Paulo',
 quiet_start time not null default '08:00', quiet_end time not null default '20:00',
 allowed_models text[] not null default '{}', monthly_budget_usd numeric(12,6) not null default 0 check(monthly_budget_usd>=0),
 knowledge text not null default '', legacy_cutoff timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.automation_flows (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), name text not null,
 description text not null default '', draft jsonb not null, revision integer not null default 1,
 status text not null default 'draft' check(status in ('draft','active','paused','archived')),
 published_version_id uuid, published_at timestamptz, created_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(company_id,id)
);
create table public.automation_versions (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, flow_id uuid not null, number integer not null,
 definition jsonb not null, actor_id uuid references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(company_id,flow_id) references public.automation_flows(company_id,id), unique(flow_id,number), unique(company_id,id)
);
alter table public.automation_flows add foreign key(company_id,published_version_id) references public.automation_versions(company_id,id);
create table public.automation_events (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), type text not null,
 source_key text not null, person_id uuid, context jsonb not null default '{}', created_at timestamptz not null default now(),
 processed_at timestamptz, unique(company_id,source_key)
);
create table public.automation_runs (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, flow_id uuid not null, version_id uuid not null,
 person_id uuid, event_key text not null, node_id text not null, context jsonb not null default '{}',
 status text not null default 'ready' check(status in ('ready','working','waiting','human','review','completed','failed','canceled','skipped')),
 due_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid, wait_kind text,
 waiting_node_id text, wait_started_at timestamptz, last_error text, ancestry uuid[] not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,flow_id) references public.automation_flows(company_id,id),
 foreign key(company_id,version_id) references public.automation_versions(company_id,id),
 unique(company_id,flow_id,event_key), unique(company_id,id)
);
create index automation_runs_due_idx on public.automation_runs(due_at) where status in ('ready','waiting','working');
create table public.automation_steps (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid not null, node_id text not null,
 status text not null, detail jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id), unique(run_id,node_id)
);
create table public.automation_tasks (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid not null, node_id text not null,
 person_id uuid, responsible_id uuid references public.profiles(id), title text not null, notes text not null default '',
 status text not null default 'open' check(status in ('open','in_progress','completed','canceled')), due_at timestamptz,
 kind text not null default 'task', created_at timestamptz not null default now(), completed_at timestamptz,
 foreign key(company_id,run_id) references public.automation_runs(company_id,id), unique(run_id,node_id)
);
create table public.automation_deliveries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid not null, node_id text not null,
 instance_id uuid not null references public.uazapi_instances(id), chat_id text not null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','sent','delivered','read','failed','uncertain')),
 provider_id text, message jsonb not null, receipts jsonb not null default '{}', last_error text, attempts integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id), unique(run_id,node_id)
);
create index automation_deliveries_provider_idx on public.automation_deliveries(instance_id,provider_id);
create table public.automation_group_occurrences (
 company_id uuid not null references public.companies(id),flow_id uuid not null references public.automation_flows(id),
 occurrence text not null,node_id text not null,chat_id text not null,run_id uuid not null references public.automation_runs(id),
 primary key(company_id,flow_id,occurrence,node_id,chat_id)
);
create table public.automation_source_owners (
 company_id uuid not null references public.companies(id),purpose text not null,flow_id uuid not null references public.automation_flows(id),
 primary key(company_id,purpose)
);
create table public.automation_conversations (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, instance_id uuid not null references public.uazapi_instances(id),
 chat_id text not null, run_id uuid not null, human boolean not null default false, expires_at timestamptz not null,
 last_outbound_id text, created_at timestamptz not null default now(),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id), unique(instance_id,chat_id)
);
create table public.automation_contacts (
 company_id uuid not null references public.companies(id), chat_id text not null, opted_out boolean not null default false,
 updated_at timestamptz not null default now(), primary key(company_id,chat_id)
);
create table public.automation_webhook_receipts (
 instance_id uuid not null references public.uazapi_instances(id), event_key text not null,
 created_at timestamptz not null default now(), primary key(instance_id,event_key)
);
create table public.automation_webhook_secrets (
 instance_id uuid primary key references public.uazapi_instances(id), company_id uuid not null references public.companies(id),
 secret_hash text not null, created_at timestamptz not null default now()
);
alter table public.automation_webhook_secrets enable row level security;
revoke all on public.automation_webhook_secrets from anon,authenticated;
create table public.automation_ai_usage (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), flow_id uuid, run_id uuid,
 request_key text not null unique, model text not null, reserved_usd numeric(12,6) not null check(reserved_usd>=0),
 cost_usd numeric(12,6), status text not null default 'reserved' check(status in ('reserved','completed','failed','uncertain')),
 tokens integer, created_at timestamptz not null default now()
);
create table public.automation_interests (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid not null, node_id text not null,
 person_id uuid not null references public.people(id), interest text not null, created_at timestamptz not null default now(),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id), unique(run_id,node_id)
);
create table public.automation_legacy_archive (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 kind text not null, source_id uuid not null, snapshot jsonb not null, archived_at timestamptz not null default now(), unique(kind,source_id)
);
insert into public.automation_settings(company_id) select id from public.companies;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'task',id,to_jsonb(t) from public.person_follow_up_tasks t;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'rule',id,to_jsonb(t) from public.person_follow_up_triggers t;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'journey',id,to_jsonb(t) from public.member_journeys t;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'journey_step',id,to_jsonb(t) from public.member_journey_steps t;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'enrollment',id,to_jsonb(t) from public.person_journey_enrollments t;
insert into public.automation_legacy_archive(company_id,kind,source_id,snapshot)
 select company_id,'progress',id,to_jsonb(t) from public.person_journey_progress t;
update public.person_follow_up_triggers set is_active=false;
update public.member_journeys set is_auto_enroll=false;
-- Old clients cannot reactivate the archived engine. Shared pastoral task tables stay available.
revoke insert,update,delete on public.person_follow_up_triggers,public.member_journeys,public.member_journey_steps,public.person_journey_enrollments,public.person_journey_progress from authenticated,anon;
create function public.reject_archived_automation_write() returns trigger language plpgsql as $$
begin raise exception 'Módulo arquivado; use Automações'; end $$;
create trigger automation_archived_rules before insert or update or delete on public.person_follow_up_triggers for each row execute function public.reject_archived_automation_write();
create trigger automation_archived_journeys before insert or update or delete on public.member_journeys for each row execute function public.reject_archived_automation_write();
create trigger automation_archived_steps before insert or update or delete on public.member_journey_steps for each row execute function public.reject_archived_automation_write();
create trigger automation_archived_enrollments before insert or update or delete on public.person_journey_enrollments for each row execute function public.reject_archived_automation_write();
create trigger automation_archived_progress before insert or update or delete on public.person_journey_progress for each row execute function public.reject_archived_automation_write();

create table public.reading_plan_enrollments (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 plan_id uuid not null references public.reading_plans(id),person_id uuid not null references public.people(id),
 status text not null default 'in_progress' check(status in ('in_progress','completed','canceled')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(plan_id,person_id)
);
create table public.reading_plan_person_progress (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 enrollment_id uuid not null references public.reading_plan_enrollments(id),step_id uuid not null references public.reading_plan_steps(id),
 person_id uuid not null references public.people(id),completed_at timestamptz not null default now(),created_at timestamptz not null default now(),unique(enrollment_id,step_id)
);

-- Read access follows the app's module roles. Mutations are server-only, with separate permissions in actions.
create or replace function public.automation_can_view(target_company uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_superadmin() or exists(select 1 from public.profiles where company_id=target_company
 and auth_user_id=auth.uid() and active and role in ('admin','pastor','communication'));
$$;
do $$ declare t text; begin
 foreach t in array array['automation_settings','automation_flows','automation_versions','automation_events','automation_runs','automation_steps','automation_tasks','automation_deliveries','automation_conversations','automation_contacts','automation_ai_usage','automation_interests','automation_legacy_archive','automation_group_occurrences','automation_source_owners'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy automation_read on public.%I for select to authenticated using (public.automation_can_view(company_id))',t);
 end loop;
end $$;
alter table public.reading_plan_enrollments enable row level security;
alter table public.reading_plan_person_progress enable row level security;
revoke all on public.reading_plan_enrollments,public.reading_plan_person_progress from anon,authenticated;
grant select on public.reading_plan_enrollments,public.reading_plan_person_progress to authenticated;
grant all on public.reading_plan_enrollments,public.reading_plan_person_progress to service_role;
create policy automation_read on public.reading_plan_enrollments for select to authenticated using(public.automation_can_view(company_id));
create policy automation_read on public.reading_plan_person_progress for select to authenticated using(public.automation_can_view(company_id));
alter table public.automation_webhook_receipts enable row level security;
revoke all on public.automation_webhook_receipts from anon,authenticated;
grant all on public.automation_webhook_receipts,public.automation_webhook_secrets to service_role;

create or replace function public.claim_automation_runs(batch_size integer default 25)
returns setof public.automation_runs language sql security definer set search_path=public as $$
 update public.automation_runs r set status='working', lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),updated_at=now()
 where r.id in (select q.id from public.automation_runs q join public.automation_flows f on f.id=q.flow_id
 where f.status='active' and q.due_at<=now() and (q.status in ('ready','waiting') or (q.status='working' and q.lease_until<now()))
 order by q.due_at for update of q skip locked limit greatest(1,least(batch_size,100))) returning r.*;
$$;
revoke all on function public.claim_automation_runs(integer) from public,anon,authenticated;
grant execute on function public.claim_automation_runs(integer) to service_role;

create or replace function public.reserve_automation_ai(target_company uuid, request_key_input text, model_input text, amount numeric, target_flow uuid default null, target_run uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare s public.automation_settings; used numeric; result uuid;
begin
 select * into s from public.automation_settings where company_id=target_company for update;
 if not found or s.monthly_budget_usd<=0 or not(model_input=any(s.allowed_models)) or amount<=0 then raise exception 'IA não habilitada para esta igreja/modelo'; end if;
 select id into result from public.automation_ai_usage where request_key=request_key_input;
 if result is not null then raise exception 'Chamada IA já reservada; revisar execução'; end if;
 select coalesce(sum(coalesce(cost_usd,reserved_usd)),0) into used from public.automation_ai_usage
 where company_id=target_company and created_at>=date_trunc('month',now()) and status<>'failed';
 if used+amount>s.monthly_budget_usd then raise exception 'Orçamento mensal de IA esgotado'; end if;
 insert into public.automation_ai_usage(company_id,request_key,model,reserved_usd,flow_id,run_id)
 values(target_company,request_key_input,model_input,amount,target_flow,target_run) returning id into result;
 return result;
end $$;
revoke all on function public.reserve_automation_ai(uuid,text,text,numeric,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_automation_ai(uuid,text,text,numeric,uuid,uuid) to service_role;

-- Trigger stores only routing identifiers. Sensitive source records never enter model context.
create or replace function public.capture_automation_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare row_data jsonb:=to_jsonb(new); old_data jsonb:='{}'; company uuid; person uuid; kind text; info jsonb;
begin
 if nullif(current_setting('app.automation_run_id',true),'') is not null then return new; end if;
 if tg_op='UPDATE' then old_data:=to_jsonb(old); end if;
 company:=nullif(row_data->>'company_id','')::uuid;
 if company is null then return new; end if;
 person:=nullif(row_data->>'person_id','')::uuid;
 kind:=tg_argv[0];
 if tg_table_name='people' then
  person:=new.id;
  if tg_op='INSERT' then kind:='person.created';
  elsif row_data->>'baptism_date' is distinct from old_data->>'baptism_date' and row_data->>'baptism_date' is not null then kind:='person.baptized';
  elsif (row_data-'updated_at')=(old_data-'updated_at') then return new;
  else kind:='person.updated'; end if;
 elsif tg_table_name in ('group_members','ministry_memberships') then
  if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new; end if;
  kind:=case when tg_table_name='group_members' then 'cell.' else 'ministry.' end || case when row_data->>'status'='active' then 'joined' else 'left' end;
 elsif tg_table_name='volunteer_assignments' then
  select person_id into person from public.volunteer_profiles where id=nullif(row_data->>'volunteer_id','')::uuid and company_id=company;
  kind:=case when tg_op='INSERT' then 'volunteer.assigned' when row_data->>'status'='confirmed' then 'volunteer.confirmed' when row_data->>'status'='declined' then 'volunteer.declined' else null end;
  if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new; end if;
 elsif tg_table_name in ('event_guest_registrations','member_event_rsvps') then
  if tg_op='UPDATE' then
   if row_data->>'checked_in_at' is not null and old_data->>'checked_in_at' is null then kind:='event.present';
   elsif row_data->>'status'='going' and old_data->>'status'<>'going' then kind:='event.registered';
   else return new; end if;
  elsif row_data->>'status'<>'going' then return new; end if;
 elsif tg_table_name='cell_visit_requests' and tg_op='UPDATE' then return new;
 elsif tg_table_name='attendance_records' then
  if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new; end if;
  kind:=case when row_data->>'status'='present' then 'attendance.present' when row_data->>'status'='absent' then 'attendance.absent' else null end;
 elsif tg_table_name='kid_attendances' then
  kind:=case when tg_op='INSERT' then 'kids.checkin' when row_data->>'checked_out_at' is not null and old_data->>'checked_out_at' is null then 'kids.checkout' else null end;
 elsif tg_table_name='kid_access_events' then
  if row_data->>'event_type'<>'guardian_called' then return new; end if;
 elsif tg_table_name='reading_plan_enrollments' then
  kind:=case when tg_op='INSERT' then 'discipleship.enrolled' when row_data->>'status'='completed' and old_data->>'status'<>'completed' then 'discipleship.completed' else null end;
 elsif tg_table_name='prayer_requests' then
  select person_id into person from public.profiles where company_id=company and (id::text=row_data->>'user_id' or auth_user_id::text=row_data->>'user_id') limit 1;
  kind:=case when tg_op='INSERT' then 'prayer.created' else 'prayer.updated' end;
  if tg_op='UPDATE' and row_data->>'status' is not distinct from old_data->>'status' then return new; end if;
 elsif tg_table_name='crm_cards' then kind:=case when tg_op='INSERT' then 'crm.created' else 'crm.updated' end;
 elsif tg_table_name='content_posts' then
  if row_data->>'status'<>'published' or (tg_op='UPDATE' and old_data->>'status'='published') then return new; end if;
 end if;
 if kind is null then return new; end if;
 if tg_table_name='attendance_records' and row_data->>'event_type'='event' then
  person:=coalesce(person,(select person_id from public.event_guest_registrations where id=nullif(row_data->>'guest_registration_id','')::uuid and company_id=company));
  insert into public.automation_events(company_id,type,source_key,person_id,context) values(company,replace(kind,'attendance.','event.'),tg_table_name||':'||(row_data->>'id')||':'||txid_current()::text||':event',person,jsonb_build_object('event_id',row_data->>'event_ref_id')) on conflict do nothing;
 end if;
 info:=jsonb_strip_nulls(jsonb_build_object('source_table',tg_table_name,'source_id',row_data->>'id','cell_id',row_data->>'group_id','event_id',row_data->>'event_id','kid_id',row_data->>'kid_id','shift_id',row_data->>'shift_id','status',row_data->>'status'));
 insert into public.automation_events(company_id,type,source_key,person_id,context)
 values(company,kind,tg_table_name||':'||(row_data->>'id')||':'||txid_current()::text||':'||kind,person,info) on conflict do nothing;
 return new;
end $$;
do $$ declare item text[]; begin
 foreach item slice 1 in array array[
 ['people','person.updated'],['group_members','cell.joined'],['ministry_memberships','ministry.joined'],['cell_visit_requests','cell.visit_requested'],
 ['attendance_records','attendance.present'],['member_event_rsvps','event.registered'],['event_guest_registrations','event.registered'],['volunteer_assignments','volunteer.assigned'],
 ['form_submissions','form.submitted'],['crm_cards','crm.updated'],['prayer_requests','prayer.created'],['kid_attendances','kids.checkin'],
 ['content_posts','content.published'],['congregations','congregation.updated'],['revenues','finance.updated'],['expenses','finance.updated'],['donations','finance.updated'],['kid_access_events','kids.guardian_called'],['reading_plan_enrollments','discipleship.enrolled'],['reading_plan_person_progress','discipleship.progress']
 ] loop
  if to_regclass('public.'||item[1]) is not null then
   execute format('create trigger automation_capture after insert or update on public.%I for each row execute function public.capture_automation_event(%L)',item[1],item[2]);
  end if;
 end loop;
end $$;

insert into public.system_modules(id,label,description,route,menu_group,icon_name,required_permission,sort_order)
values('automations','Automações','Fluxos de cuidado, WhatsApp e IA.','/automacoes','Comunicar','Workflow','automations.view',105)
on conflict(id) do update set label=excluded.label,route=excluded.route,required_permission=excluded.required_permission,active=true;
insert into public.plan_modules(plan_id,module_id,included) select id,'automations',true from public.system_plans on conflict(plan_id,module_id) do nothing;
insert into public.company_modules(company_id,module_id,enabled) select id,'automations',true from public.companies on conflict(company_id,module_id) do nothing;

-- Scheduling configuration is in Vault. Without it the job stays harmless and flows remain drafts.
create or replace function public.invoke_automation_worker() returns bigint
language plpgsql security definer set search_path=public,extensions,vault,net as $$
declare endpoint text; secret text;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='automation_worker_url' limit 1;
 select decrypted_secret into secret from vault.decrypted_secrets where name='automation_worker_secret' limit 1;
 if endpoint is null or secret is null then return null; end if;
 return net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-automation-worker-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
end $$;
revoke all on function public.invoke_automation_worker() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('automation-worker-minute','* * * * *','select public.invoke_automation_worker();');
 end if;
end $$;
