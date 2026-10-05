-- Incremental change: preserves all published versions and existing records.
create table public.automation_kanban_moves (
 id uuid primary key default gen_random_uuid(), company_id uuid not null, run_id uuid not null,
 node_id text not null, card_id uuid not null references public.crm_cards(id), stage_id uuid not null references public.crm_stages(id),
 created_at timestamptz not null default now(), unique(run_id,node_id),
 foreign key(company_id,run_id) references public.automation_runs(company_id,id)
);
create table public.automation_test_deliveries (
 id uuid primary key, company_id uuid not null references public.companies(id),
 actor_id uuid not null references public.profiles(id), instance_id uuid not null references public.uazapi_instances(id),
 node_id text not null, chat_id text not null, message jsonb not null,
 status text not null check(status in ('sending','accepted','failed','uncertain')),
 provider_id text, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.automation_kanban_moves enable row level security;
alter table public.automation_test_deliveries enable row level security;
revoke all on public.automation_kanban_moves,public.automation_test_deliveries from anon,authenticated;
grant select on public.automation_kanban_moves,public.automation_test_deliveries to authenticated;
grant all on public.automation_kanban_moves,public.automation_test_deliveries to service_role;
create policy automation_kanban_moves_read on public.automation_kanban_moves for select to authenticated using(public.automation_can_view(company_id));
create policy automation_test_deliveries_read on public.automation_test_deliveries for select to authenticated using(public.automation_can_view(company_id));

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
 if tg_table_name='form_submissions' then
  if tg_op<>'INSERT' or person is null then return new; end if;
  if not exists(select 1 from public.people where id=person and company_id=company and deleted_at is null) then return new; end if;
 elsif tg_table_name='people' then
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
 info:=jsonb_strip_nulls(jsonb_build_object('form_id',case when tg_table_name='form_submissions' then row_data->>'form_id' end,'submission_id',case when tg_table_name='form_submissions' then row_data->>'id' end,'crm_card_id',case when tg_table_name='form_submissions' then row_data->>'crm_card_id' end,'source_table',tg_table_name,'source_id',row_data->>'id','cell_id',row_data->>'group_id','event_id',row_data->>'event_id','kid_id',row_data->>'kid_id','shift_id',row_data->>'shift_id','status',row_data->>'status'));
 insert into public.automation_events(company_id,type,source_key,person_id,context)
 values(company,kind,case when tg_table_name='form_submissions' then 'form_submission:'||(row_data->>'id') else tg_table_name||':'||(row_data->>'id')||':'||txid_current()::text||':'||kind end,person,info) on conflict do nothing;
 return new;
end $$;
