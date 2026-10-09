-- Personal operational inbox. Campaigns and their deliveries remain independent.
create table public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  kind text not null,
  module text not null,
  source_table text not null,
  source_id uuid not null,
  scope_kind text not null,
  scope_id uuid,
  audience text not null check (audience in ('managers','person','profile','all')),
  subject_id uuid,
  title text not null,
  summary text not null default '',
  href text not null check (href like '/%' and href not like '//%'),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique(company_id, profile_id, event_key)
);
create index notification_inbox_page_idx on public.notification_inbox(company_id, profile_id, created_at desc, id desc);
create index notification_inbox_unread_idx on public.notification_inbox(company_id, profile_id) where read_at is null;
create index notification_inbox_source_idx on public.notification_inbox(source_table, source_id);
create index notification_inbox_profile_idx on public.notification_inbox(profile_id);

create table private.notification_inbox_push (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.notification_inbox(id) on delete cascade,
  subscription_id uuid not null references public.notification_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','canceled','dead')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  sent_at timestamptz,
  unique(inbox_id, subscription_id)
);
create index notification_inbox_push_due_idx on private.notification_inbox_push(next_attempt_at) where status in ('pending','failed','processing');
create index notification_inbox_push_subscription_idx on private.notification_inbox_push(subscription_id);
alter table public.ministry_chat_reads add column push_opted_out boolean not null default false;
alter table private.notification_inbox_push enable row level security;

-- Explicit target profile, rather than auth.uid(), also permits worker revalidation.
create function private.notification_recipient_access(target uuid, company uuid, scope text, scope_id uuid, audience text, subject uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles%rowtype;
  person uuid;
  ministry uuid;
  department uuid;
begin
  select * into p from public.profiles where id=target and company_id=company and active and deleted_at is null;
  if not found then return false; end if;
  select id into person from public.people where company_id=company and deleted_at is null and is_active and status <> 'inactive'
    and (profile_id=target or id=p.person_id) order by (profile_id=target) desc limit 1;
  if audience='person' then return person is not null and person=subject; end if;
  if audience='profile' then
    if target is distinct from subject then return false; end if;
    -- Assignment recipients still need permission to open their task/module.
    if scope='tasks' then return coalesce(p.roles,array[p.role]) && array['superadmin','admin','pastor','communication']; end if;
    if scope='kids' then
      return coalesce(p.roles,array[p.role]) && array['superadmin','admin','pastor','volunteer','ministry_leader'];
    end if;
    return true;
  end if;
  if audience='all' then return true; end if;
  if coalesce(p.roles,array[p.role]) && array['superadmin','admin','pastor'] then return true; end if;
  if scope='ministry' then
    return exists(select 1 from public.ministries m where m.id=scope_id and m.company_id=company and m.is_active and m.deleted_at is null
      and (m.leader_person_id=person or exists(select 1 from public.ministry_memberships mm where mm.company_id=company and mm.ministry_id=m.id
        and mm.person_id=person and mm.status='active' and mm.left_at is null and mm.role in ('leader','coordinator'))));
  elsif scope='cell' then
    return exists(select 1 from public.groups g where g.id=scope_id and g.company_id=company and g.is_active and g.deleted_at is null
      and (person in (g.leader_person_id,g.co_leader_person_id,g.coordinator_person_id) or coalesce(p.roles,array[p.role]) && array['cell_supervisor'] or exists(
        select 1 from public.group_members gm where gm.company_id=company and gm.group_id=g.id and gm.person_id=person
        and gm.status='active' and gm.left_at is null and gm.role in ('leader','auxiliary'))));
  elsif scope='shift' then
    select s.department_id,d.ministry_id into department,ministry from public.volunteer_shifts s
      join public.volunteer_departments d on d.id=s.department_id and d.company_id=company and d.deleted_at is null
      where s.id=scope_id and s.company_id=company;
    return exists(select 1 from public.volunteer_department_access a where a.company_id=company and a.department_id=department and a.profile_id=target)
      or exists(select 1 from public.volunteer_departments d where d.id=department and d.company_id=company and d.manager_profile_id=target)
      or (ministry is not null and private.notification_recipient_access(target,company,'ministry',ministry,'managers',null));
  elsif scope='kids' then
    return exists(select 1 from public.kid_settings k where k.company_id=company and k.congregation_id is null and k.ministry_id is not null
      and private.notification_recipient_access(target,company,'ministry',k.ministry_id,'managers',null));
  elsif scope='finance' then return coalesce(p.roles,array[p.role]) && array['finance'];
  elsif scope='prayer' then return coalesce(p.roles,array[p.role]) && array['cell_supervisor'];
  elsif scope in ('tasks','automation','delivery') then return coalesce(p.roles,array[p.role]) && array['communication'];
  end if;
  return false;
end;
$$;

-- Source visibility is checked on every inbox read and before each push.
create function private.notification_source_access(item public.notification_inbox)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare row_data jsonb; event_data jsonb;
begin
  if not private.notification_recipient_access(item.profile_id,item.company_id,item.scope_kind,item.scope_id,item.audience,item.subject_id) then return false; end if;
  if item.source_table not in ('ministry_chat_messages','volunteer_shift_messages','kid_conversation_messages','ministry_memberships','group_members',
    'volunteer_assignments','volunteer_swap_requests','events','member_event_rsvps','event_guest_registrations','event_registrations',
    'form_submissions','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions','cell_visit_requests',
    'automation_tasks','person_follow_up_tasks','automation_runs','prayer_requests','cell_prayer_requests','announcements','cell_notices',
    'volunteer_shifts','volunteer_schedules','revenues','expenses','notification_deliveries','integration_delivery_outbox','form_whatsapp_deliveries','automation_deliveries','volunteer_delivery_outbox','kid_delivery_outbox','cell_whatsapp_deliveries') then return false; end if;
  execute format('select to_jsonb(s) from public.%I s where id=$1 and company_id=$2',item.source_table)
    into row_data using item.source_id,item.company_id;
  if row_data is null or row_data->>'deleted_at' is not null then return false; end if;
  if item.source_table='announcements' and not coalesce((row_data->>'published')::boolean,false) then return false; end if;
  if item.source_table='cell_notices' then
    if not coalesce((row_data->>'is_active')::boolean,false) or (row_data->>'published_at')::timestamptz>now() then return false; end if;
    return exists(select 1 from public.group_members gm join public.people p on p.id=gm.person_id and p.company_id=item.company_id
      where gm.company_id=item.company_id and gm.status='active' and gm.left_at is null
      and (p.profile_id=item.profile_id or p.id=(select person_id from public.profiles where id=item.profile_id))
      and (row_data->>'audience'='all' or exists(select 1 from public.cell_notice_targets t where t.company_id=item.company_id and t.notice_id=item.source_id and t.group_id=gm.group_id)));
  end if;
  if item.audience='all' and item.scope_kind='ministry' then
    return exists(select 1 from public.ministry_memberships mm join public.people person on person.id=mm.person_id
      where mm.company_id=item.company_id and mm.ministry_id=item.scope_id and mm.status='active' and mm.left_at is null
      and person.deleted_at is null and (person.profile_id=item.profile_id or person.id=(select person_id from public.profiles where id=item.profile_id)));
  end if;
  if item.source_table='events' and item.audience='person' then
    return exists(select 1 from public.member_event_rsvps where company_id=item.company_id and event_id=item.source_id and person_id=item.subject_id and status <> 'canceled')
      or exists(select 1 from public.ministry_memberships where company_id=item.company_id and ministry_id=(row_data->>'ministry_id')::uuid and person_id=item.subject_id and status='active' and left_at is null)
      or exists(select 1 from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id
        join public.volunteer_shifts s on s.id=a.shift_id where a.company_id=item.company_id and s.event_id=item.source_id and v.person_id=item.subject_id and a.status <> 'cancelled');
  end if;
  if item.source_table in ('automation_tasks','person_follow_up_tasks') and item.audience='profile' then
    return coalesce(row_data->>'responsible_id',row_data->>'responsible_profile_id')=item.profile_id::text
      and (item.source_table <> 'person_follow_up_tasks' or exists(select 1 from public.profiles where id=item.profile_id and coalesce(roles,array[role]) && array['superadmin','admin','pastor']));
  end if;
  if item.source_table in ('integration_delivery_outbox','form_whatsapp_deliveries') then
    return exists(select 1 from public.profiles where id=item.profile_id and coalesce(roles,array[role]) && array['superadmin','admin','pastor']);
  end if;
  if item.source_table in ('ministry_chat_messages','volunteer_shift_messages') then
    if item.scope_kind='ministry' then
      return exists(select 1 from public.ministries where id=item.scope_id and company_id=item.company_id and deleted_at is null and is_active);
    else
      return exists(select 1 from public.volunteer_shifts s left join public.events e on e.id=s.event_id and e.company_id=s.company_id
        where s.id=item.scope_id and s.company_id=item.company_id and (s.event_id is null or e.deleted_at is null));
    end if;
  end if;
  if item.source_table='kid_conversation_messages' then
    return exists(select 1 from public.kid_conversations where id=(row_data->>'conversation_id')::uuid and company_id=item.company_id and deleted_at is null);
  end if;
  if item.scope_kind='shift' and item.audience='person' and item.source_table <> 'volunteer_assignments' then
    return exists(select 1 from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id
      where a.shift_id=item.scope_id and a.company_id=item.company_id and v.person_id=item.subject_id);
  end if;
  return true;
end;
$$;

create function private.notification_own_access(item public.notification_inbox)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=item.profile_id and p.auth_user_id=(select auth.uid())
    and p.company_id=item.company_id and p.active and p.deleted_at is null) and private.notification_source_access(item)
$$;
revoke all on function private.notification_recipient_access(uuid,uuid,text,uuid,text,uuid), private.notification_source_access(public.notification_inbox), private.notification_own_access(public.notification_inbox) from public, anon, authenticated;
grant execute on function private.notification_recipient_access(uuid,uuid,text,uuid,text,uuid), private.notification_source_access(public.notification_inbox) to service_role;
grant execute on function private.notification_own_access(public.notification_inbox) to authenticated;
alter table public.notification_inbox enable row level security;
revoke all on public.notification_inbox from anon, authenticated;
create policy "Read own authorized inbox" on public.notification_inbox for select to authenticated using (private.notification_own_access(notification_inbox));
grant select on public.notification_inbox to authenticated;
grant all on public.notification_inbox to service_role;

create function private.emit_operational_notification(company uuid, event_key text, kind text, module text, source_table text, source_id uuid,
  scope text, scope_id uuid, audience text, subject uuid, actor uuid, title text, summary text, dashboard_href text, portal_href text)
returns void language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  insert into public.notification_inbox(company_id,profile_id,event_key,kind,module,source_table,source_id,scope_kind,scope_id,audience,subject_id,title,summary,href)
  select company,p.id,event_key,kind,module,source_table,source_id,scope,scope_id,audience,subject,title,left(summary,500),
    case when coalesce(p.roles,array[p.role]) && array['superadmin','admin','pastor','communication','finance','cell_supervisor'] then dashboard_href else portal_href end
  from public.profiles p where p.company_id=company and p.id is distinct from actor
    and private.notification_recipient_access(p.id,company,scope,scope_id,audience,subject)
  on conflict(company_id,profile_id,event_key) do nothing;
  update public.notification_inbox n set href='/notificacoes/'||n.id
    where n.company_id=company and n.event_key=emit_operational_notification.event_key and n.kind='chat.message' and n.scope_kind='shift';
  insert into private.notification_inbox_push(inbox_id,subscription_id)
  select n.id,s.id from public.notification_inbox n join public.notification_push_subscriptions s on s.company_id=n.company_id and s.profile_id=n.profile_id and s.is_active
  where n.company_id=company and n.event_key=emit_operational_notification.event_key and n.read_at is null
    and not exists(select 1 from public.notification_channel_preferences pref where pref.company_id=company and pref.person_id=s.person_id and pref.channel='push' and pref.opted_out)
    and (kind <> 'chat.message' or scope <> 'ministry' or not exists(select 1 from public.ministry_chat_reads r where r.ministry_id=scope_id and r.profile_id=n.profile_id and (r.muted or r.push_opted_out)))
  on conflict(inbox_id,subscription_id) do nothing;
end;
$$;
revoke all on function private.emit_operational_notification(uuid,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function private.emit_operational_notification(uuid,text,text,text,text,uuid,text,uuid,text,uuid,uuid,text,text,text,text) to service_role;

-- JSON row routing keeps the domain write and its notifications in one transaction,
-- including writes made by APIs, scheduling jobs and automation workers.
create function private.route_operational_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  n jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  company uuid := (n->>'company_id')::uuid;
  source uuid := (n->>'id')::uuid;
  actor uuid := coalesce(n->>'sender_profile_id',n->>'updated_by',n->>'created_by',n->>'reported_by',n->>'author_id')::uuid;
  scope text; scope_id uuid; module text; kind text; title text; summary text := '';
  dash text; portal text; person uuid; target uuid; event uuid; row_data jsonb;
  key text; personal boolean := false; managers boolean := true; all_people boolean := false;
begin
  if tg_op='DELETE' and tg_table_name <> 'kid_staff_assignments' then return null; end if;
  if n->>'deleted_at' is not null or company is null then return null; end if;
  if tg_table_name='ministry_chat_messages' and tg_op='INSERT' then
    scope:='ministry'; scope_id:=(n->>'ministry_id')::uuid; module:='ministries'; kind:='chat.message'; title:='Nova mensagem no ministério';
    select name into summary from public.ministries where id=scope_id and company_id=company;
    dash:='/ministerios/'||scope_id||'/chat'; portal:='/membro/chats?ministry='||scope_id;
  elsif tg_table_name='volunteer_shift_messages' and tg_op='INSERT' then
    scope:='shift'; module:='volunteers'; kind:='chat.message'; title:='Nova mensagem na escala';
    select shift_id into scope_id from public.volunteer_shift_conversations where id=(n->>'conversation_id')::uuid and company_id=company;
    dash:='/voluntariado?shift='||scope_id; portal:='/membro/voluntariado?shift='||scope_id;
  elsif tg_table_name='kid_conversation_messages' and tg_op='INSERT' then
    scope:='kids'; scope_id:=(n->>'kid_id')::uuid; module:='kids'; kind:='chat.message'; title:='Nova mensagem no Kids';
    dash:='/kids?tab=comunicacao&conversation='||(n->>'conversation_id'); portal:='/membro/kids';
  elsif tg_table_name='ministry_memberships' and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then
    scope:='ministry'; scope_id:=(n->>'ministry_id')::uuid; module:='ministries'; kind:='membership.'||(n->>'status'); person:=(n->>'person_id')::uuid;
    if n->>'status'='pending' then title:='Pedido de participação no ministério'; else title:='Participação no ministério atualizada'; personal:=true; end if;
    dash:='/ministerios/'||scope_id||'?tab=pessoas'; portal:='/membro/ministerios?ministry='||scope_id;
  elsif tg_table_name in ('cell_visit_requests','group_members') and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then
    scope:='cell'; scope_id:=(n->>'group_id')::uuid; module:='cells'; kind:='cell.request'; person:=(n->>'person_id')::uuid;
    if not exists(select 1 from public.groups where id=scope_id and company_id=company and type='cell') then return null; end if;
    title:=case when tg_op='INSERT' then 'Nova solicitação na célula' else 'Solicitação da célula atualizada' end; personal:=tg_op='UPDATE';
    dash:='/celulas?group='||scope_id; portal:='/membro/celulas?group='||scope_id;
  elsif tg_table_name='volunteer_assignments' then
    scope:='shift'; scope_id:=(n->>'shift_id')::uuid; module:='volunteers'; kind:='scale.changed';
    select v.person_id into person from public.volunteer_profiles v where v.id=(n->>'volunteer_id')::uuid and v.company_id=company;
    select to_jsonb(e) into row_data from public.volunteer_shifts s join public.volunteer_schedules schedule on schedule.id=s.schedule_id
      left join public.events e on e.id=s.event_id and e.company_id=company where s.id=scope_id and s.company_id=company
        and (schedule.status='published' or e.volunteer_schedule_published_at is not null);
    if row_data is null and not exists(select 1 from public.volunteer_shifts s join public.volunteer_schedules schedule on schedule.id=s.schedule_id where s.id=scope_id and s.company_id=company and schedule.status='published') then return null; end if;
    if tg_op='UPDATE' and n->>'status'=o->>'status' and n->>'volunteer_id'=o->>'volunteer_id' then return null; end if;
    if n->>'status'='declined' then kind:='scale.absence'; title:='Membro avisou que não conseguirá ir';
    else title:='Sua escala foi atualizada'; personal:=true; managers:=false; end if;
    dash:='/voluntariado?shift='||scope_id; portal:='/membro/voluntariado?shift='||scope_id;
    if row_data->>'ministry_id' is not null then
      dash:='/ministerios/'||(row_data->>'ministry_id')||'?tab=escalas'; portal:='/membro/ministerios?ministry='||(row_data->>'ministry_id');
    end if;
    -- A replaced person must also see that their assignment was removed.
    if tg_op='UPDATE' and n->>'volunteer_id' is distinct from o->>'volunteer_id' then
      select v.person_id into target from public.volunteer_profiles v where v.id=(o->>'volunteer_id')::uuid and v.company_id=company;
      perform private.emit_operational_notification(company,'assignment.replaced:'||source||':'||(n->>'updated_at'),'scale.changed',module,tg_table_name,source,
        scope,scope_id,'person',target,actor,'Sua participação na escala mudou','Confira a escala atualizada.',dash,portal);
    end if;
  elsif tg_table_name='volunteer_swap_requests' and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then
    scope:='shift'; module:='volunteers'; kind:='scale.swap'; title:='Pedido de troca de escala';
    select a.shift_id,v.person_id into scope_id,person from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id
      where a.id=(n->>'assignment_id')::uuid and a.company_id=company;
    personal:=tg_op='UPDATE'; dash:='/voluntariado?shift='||scope_id; portal:='/membro/voluntariado?shift='||scope_id;
  elsif tg_table_name='volunteer_shifts' and tg_op='UPDATE' and
    (n->>'starts_at' is distinct from o->>'starts_at' or n->>'ends_at' is distinct from o->>'ends_at' or n->>'instructions' is distinct from o->>'instructions' or n->>'role_name' is distinct from o->>'role_name') then
    if not exists(select 1 from public.volunteer_schedules s left join public.events e on e.id=(n->>'event_id')::uuid and e.company_id=company
      where s.id=(n->>'schedule_id')::uuid and s.company_id=company and (s.status='published' or e.volunteer_schedule_published_at is not null)) then return null; end if;
    scope:='shift'; scope_id:=source; module:='volunteers'; kind:='scale.changed'; title:='Horário ou função da escala mudou'; dash:='/voluntariado?shift='||source; portal:='/membro/voluntariado?shift='||source;
    for person in select v.person_id from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id where a.company_id=company and a.shift_id=source and a.status not in ('declined','cancelled') loop
      perform private.emit_operational_notification(company,'shift:'||source||':'||(n->>'updated_at'),kind,module,tg_table_name,source,scope,scope_id,'person',person,actor,title,'Confira sua escala.',dash,portal);
    end loop;
    return null;
  elsif tg_table_name='volunteer_schedules' and n->>'status'='published' and o->>'status' is distinct from 'published' then
    module:='volunteers'; kind:='scale.published'; title:='Escala publicada';
    for row_data in select jsonb_build_object('shift',s.id,'person',v.person_id) from public.volunteer_shifts s join public.volunteer_assignments a on a.shift_id=s.id and a.company_id=company join public.volunteer_profiles v on v.id=a.volunteer_id where s.company_id=company and s.schedule_id=source and a.status not in ('declined','cancelled') loop
      scope_id:=(row_data->>'shift')::uuid; person:=(row_data->>'person')::uuid;
      perform private.emit_operational_notification(company,'schedule:'||source||':'||scope_id||':'||(n->>'updated_at'),kind,module,tg_table_name,source,'shift',scope_id,'person',person,actor,title,'Confira sua escala.','/voluntariado?shift='||scope_id,'/membro/voluntariado?shift='||scope_id);
    end loop;
    return null;
  elsif tg_table_name='events' then
    module:='events'; event:=source; scope_id:=(n->>'ministry_id')::uuid; scope:=case when scope_id is null then 'event' else 'ministry' end;
    if tg_op='UPDATE' and n->>'volunteer_schedule_published_at' is not null and o->>'volunteer_schedule_published_at' is null then
      kind:='scale.published'; title:='Escala publicada';
    elsif tg_op='UPDATE' and o->>'status' not in ('draft','canceled','cancelled') and
      (n->>'starts_at' is distinct from o->>'starts_at' or n->>'ends_at' is distinct from o->>'ends_at' or n->>'location' is distinct from o->>'location' or n->>'status' in ('canceled','cancelled')) then
      kind:='event.changed'; title:='Agenda atualizada';
    else return null; end if;
    summary:=n->>'title'; dash:='/eventos/'||source; portal:='/membro/agenda?event='||source; managers:=false;
    for person in select distinct r.person_id from public.member_event_rsvps r where r.company_id=company and r.event_id=event and r.status <> 'canceled'
      union select v.person_id from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id
      join public.volunteer_shifts s on s.id=a.shift_id where a.company_id=company and s.event_id=event and a.status not in ('declined','cancelled')
      union select mm.person_id from public.ministry_memberships mm where mm.company_id=company and mm.ministry_id=scope_id and mm.status='active' and mm.left_at is null
    loop
      perform private.emit_operational_notification(company,'events:'||source||':'||kind||':'||(n->>'updated_at'),kind,module,tg_table_name,source,
        scope,scope_id,'person',person,actor,title,summary,dash,portal);
    end loop;
    return null;
  elsif tg_table_name in ('member_event_rsvps','event_guest_registrations','event_registrations') and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then
    scope:='event'; event:=(n->>'event_id')::uuid; module:='events'; kind:='event.registration'; title:='Inscrição de evento atualizada';
    select ministry_id into scope_id from public.events where id=event and company_id=company;
    if scope_id is not null then scope:='ministry'; end if;
    person:=(n->>'person_id')::uuid; personal:=true; dash:='/eventos/'||event; portal:='/membro/agenda?event='||event;
  elsif tg_table_name='form_submissions' and tg_op='INSERT' then
    scope:='forms'; module:='forms'; kind:='form.received'; title:='Nova resposta de formulário';
    dash:='/formularios/'||(n->>'form_id'); portal:=dash;
  elsif tg_table_name='kid_incidents' and tg_op='INSERT' then
    scope:='kids'; scope_id:=(n->>'kid_id')::uuid; module:='kids'; kind:='kids.incident'; title:='Nova ocorrência no Kids'; dash:='/kids?tab=sessoes'; portal:='/membro/kids';
  elsif tg_table_name='kid_attendances' and n->>'checkout_requested_at' is not null and n->>'checkout_requested_at' is distinct from o->>'checkout_requested_at' then
    scope:='kids'; scope_id:=(n->>'kid_id')::uuid; module:='kids'; kind:='kids.pickup'; title:='Retirada solicitada no Kids'; actor:=(n->>'checkout_requested_by')::uuid;
    dash:='/kids?tab=sessoes'; portal:='/membro/kids';
  elsif tg_table_name='kid_staff_assignments' then
    scope:='kids'; scope_id:=(n->>'session_id')::uuid; module:='kids'; kind:='kids.assignment'; title:='Escala Kids atualizada';
    target:=(n->>'profile_id')::uuid; managers:=false; dash:='/kids?tab=sessoes'; portal:='/kids?tab=sessoes';
    if tg_op='DELETE' then
      -- Keep deletion notices anchored to the surviving session.
      source:=scope_id;
    elsif tg_op='UPDATE' and n->>'profile_id'=o->>'profile_id' and n->>'assignment_role'=o->>'assignment_role' and n->>'session_classroom_id'=o->>'session_classroom_id' then return null; end if;
  elsif tg_table_name='kid_sessions' and tg_op='UPDATE' and n->>'status'='cancelled' and n->>'status' is distinct from o->>'status' then
    scope:='kids'; module:='kids'; kind:='kids.session.canceled'; title:='Sessão Kids cancelada'; scope_id:=source;
    dash:='/kids?tab=sessoes'; portal:=dash;
    for target in select profile_id from public.kid_staff_assignments where company_id=company and session_id=source loop
      perform private.emit_operational_notification(company,'kids.session:'||source||':'||(n->>'updated_at'),kind,module,tg_table_name,source,scope,scope_id,'profile',target,actor,title,'Confira a programação.',dash,portal);
    end loop;
  elsif tg_table_name in ('automation_tasks','person_follow_up_tasks') and (tg_op='INSERT' or coalesce(n->>'responsible_id',n->>'responsible_profile_id') is distinct from coalesce(o->>'responsible_id',o->>'responsible_profile_id')) then
    scope:='tasks'; module:='tasks'; kind:='task.assigned'; title:='Uma tarefa foi atribuída a você';
    target:=coalesce(n->>'responsible_id',n->>'responsible_profile_id')::uuid; managers:=target is null;
    dash:=case when tg_table_name='automation_tasks' then '/automacoes?tab=Tarefas' else '/crm?person='||(n->>'person_id') end; portal:=dash;
  elsif tg_table_name='automation_runs' and n->>'status' in ('human','review','failed') and n->>'status' is distinct from o->>'status' then
    scope:='automation'; module:='automations'; kind:='automation.attention'; title:='Automação precisa de atenção'; dash:='/automacoes?tab=Execuções'; portal:=dash;
  elsif tg_table_name in ('prayer_requests','cell_prayer_requests') and (tg_op='INSERT' or n->>'status' is distinct from o->>'status') then
    scope:=case when tg_table_name='cell_prayer_requests' then 'cell' else 'prayer' end; scope_id:=(n->>'group_id')::uuid;
    module:='prayer'; kind:='prayer.changed'; title:=case when tg_op='INSERT' then 'Novo pedido de oração' else 'Pedido de oração atualizado' end;
    target:=case when tg_op='UPDATE' then coalesce(n->>'user_id',n->>'author_profile_id')::uuid else null end;
    person:=coalesce(n->>'person_id',n->>'author_person_id')::uuid; personal:=tg_op='UPDATE'; dash:='/intercessao'; portal:='/membro/oracao';
  elsif tg_table_name='announcements' and coalesce((n->>'published')::boolean,false) and not coalesce((o->>'published')::boolean,false) then
    module:='content'; kind:='announcement.published'; title:='Novo comunicado'; summary:=n->>'title';
    scope:='content'; dash:='/dashboard'; portal:='/membro'; all_people:=true; managers:=false;
  elsif tg_table_name in ('cell_notices','cell_notice_targets') and tg_op='INSERT' then
    if tg_table_name='cell_notice_targets' then
      source:=(n->>'notice_id')::uuid;
      select to_jsonb(notice) into n from public.cell_notices notice where notice.id=source and notice.company_id=company;
      if n->>'audience'='all' then return null; end if;
    end if;
    if not coalesce((n->>'is_active')::boolean,false) or (n->>'published_at')::timestamptz>now() then return null; end if;
    for row_data in select distinct jsonb_build_object('person',gm.person_id,'cell',gm.group_id) from public.group_members gm join public.groups g on g.id=gm.group_id and g.type='cell' and g.is_active and g.deleted_at is null
      where gm.company_id=company and gm.status='active' and gm.left_at is null and (n->>'audience'='all' or exists(select 1 from public.cell_notice_targets t where t.company_id=company and t.notice_id=source and t.group_id=gm.group_id)) loop
      scope_id:=(row_data->>'cell')::uuid; person:=(row_data->>'person')::uuid;
      perform private.emit_operational_notification(company,'cell.notice:'||source,'announcement.published','cells','cell_notices',source,'cell',scope_id,'person',person,actor,'Novo comunicado da célula',n->>'title','/celulas?group='||scope_id,'/membro/celulas?group='||scope_id);
    end loop;
    return null;
  elsif tg_table_name in ('notification_deliveries','integration_delivery_outbox','form_whatsapp_deliveries','automation_deliveries','volunteer_delivery_outbox','kid_delivery_outbox','cell_whatsapp_deliveries') and
    ((n->>'status'='dead' and o->>'status' is distinct from 'dead') or
     (tg_table_name='automation_deliveries' and n->>'status'='uncertain' and o->>'status' is distinct from 'uncertain') or
     (n->>'status'='failed' and coalesce((n->>'attempts')::integer,0)>=case when tg_table_name='automation_deliveries' then 5 else 8 end and
      (o->>'status' is distinct from 'failed' or coalesce((o->>'attempts')::integer,0)<case when tg_table_name='automation_deliveries' then 5 else 8 end))) then
    scope:='delivery'; module:='deliveries'; kind:='delivery.failed'; title:='Um envio precisa de atenção';
    if tg_table_name='kid_delivery_outbox' then scope:='kids'; module:='kids';
    elsif tg_table_name='volunteer_delivery_outbox' and n->>'assignment_id' is not null then
      scope:='shift'; module:='volunteers'; select shift_id into scope_id from public.volunteer_assignments where id=(n->>'assignment_id')::uuid and company_id=company;
    elsif tg_table_name='cell_whatsapp_deliveries' then scope:='cell'; scope_id:=(n->>'group_id')::uuid; module:='cells'; end if;
    dash:=case when scope='kids' then '/kids?tab=comunicacao' when scope='cell' then '/celulas?group='||scope_id when scope='shift' then '/voluntariado?shift='||scope_id
      when tg_table_name='automation_deliveries' then '/automacoes?tab=Execuções' when tg_table_name='form_whatsapp_deliveries' then '/formularios' when tg_table_name='integration_delivery_outbox' then '/configuracoes?tab=integracoes' else '/notificacao' end;
    portal:=case when scope='cell' then '/membro/celulas?group='||scope_id when scope='shift' then '/membro/voluntariado?shift='||scope_id else dash end;
  else return null; end if;
  key:=tg_table_name||':'||source||':'||kind||':'||coalesce(n->>'updated_at',n->>'created_at',clock_timestamp()::text);
  if summary='' then summary:='Abra para ver os detalhes.'; end if;
  if managers then perform private.emit_operational_notification(company,key,kind,module,tg_table_name,source,scope,scope_id,'managers',null,actor,title,summary,dash,portal); end if;
  if personal and person is not null then perform private.emit_operational_notification(company,key,kind,module,tg_table_name,source,scope,scope_id,'person',person,actor,title,summary,dash,portal); end if;
  if target is not null then perform private.emit_operational_notification(company,key,kind,module,
    case when tg_table_name='kid_staff_assignments' and tg_op='DELETE' then 'kid_sessions' else tg_table_name end,source,scope,scope_id,'profile',target,actor,title,summary,dash,portal); end if;
  if all_people then perform private.emit_operational_notification(company,key,kind,module,tg_table_name,source,scope,scope_id,'all',null,actor,title,summary,dash,portal); end if;
  return null;
end;
$$;
revoke all on function private.route_operational_notification() from public, anon, authenticated;

do $$ declare name text; begin
  foreach name in array array['ministry_chat_messages','volunteer_shift_messages','kid_conversation_messages','ministry_memberships','group_members',
    'volunteer_assignments','volunteer_swap_requests','events','member_event_rsvps','event_guest_registrations','event_registrations',
    'form_submissions','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions','cell_visit_requests',
    'automation_tasks','person_follow_up_tasks','automation_runs','prayer_requests','cell_prayer_requests','announcements','cell_notices','cell_notice_targets','volunteer_shifts','volunteer_schedules',
    'notification_deliveries','integration_delivery_outbox','form_whatsapp_deliveries','automation_deliveries','volunteer_delivery_outbox','kid_delivery_outbox','cell_whatsapp_deliveries'] loop
    if to_regclass('public.'||name) is not null then
      execute format('create trigger operational_notification after insert or update or delete on public.%I for each row execute function private.route_operational_notification()',name);
    end if;
  end loop;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.notification_inbox;
  end if;
end $$;

-- Prevent legacy producers (including an older application during rollout) from
-- sending a second push for new chats. Already queued deliveries may finish.
create function private.skip_legacy_operational_chat_push() returns trigger language plpgsql set search_path = '' as $$
begin return null; end;
$$;
revoke all on function private.skip_legacy_operational_chat_push() from public, anon, authenticated;
create trigger central_chat_push before insert on public.ministry_chat_push_outbox for each row execute function private.skip_legacy_operational_chat_push();
create trigger central_chat_push before insert on public.volunteer_delivery_outbox for each row when (new.chat_message_id is not null) execute function private.skip_legacy_operational_chat_push();

create table private.notification_daily_checks(company_id uuid primary key references public.companies(id) on delete cascade, checked_on date not null);
alter table private.notification_daily_checks enable row level security;
create function private.detect_operational_notification_due() returns integer language plpgsql security definer set search_path = '' as $$
declare c record; r record; today date; total integer:=0; scope text; dash text; assigned uuid;
begin
  for c in select id,coalesce(nullif(to_jsonb(companies)->>'timezone',''),'America/Sao_Paulo') as timezone from public.companies where active loop
    today:=(now() at time zone c.timezone)::date;
    insert into private.notification_daily_checks values(c.id,today) on conflict(company_id) do update set checked_on=excluded.checked_on where notification_daily_checks.checked_on < excluded.checked_on;
    if not found then continue; end if;
    for r in
      select 'revenues'::text as source,id,due_date::text as due,'finance'::text as scope,null::uuid as responsible from public.revenues where company_id=c.id and not received and deleted_at is null and due_date < today
      union all select 'expenses',id,due_date::text,'finance',null::uuid from public.expenses where company_id=c.id and not paid and deleted_at is null and due_date < today
      union all select 'automation_tasks',id,due_at::text,'tasks',responsible_id from public.automation_tasks where company_id=c.id and status in ('open','in_progress') and due_at < now()
      union all select 'person_follow_up_tasks',id,due_at::text,'tasks',responsible_profile_id from public.person_follow_up_tasks where company_id=c.id and deleted_at is null and status in ('open','in_progress') and due_at < now()
    loop
      dash:=case when r.scope='finance' then '/financeiro' when r.source='automation_tasks' then '/automacoes?tab=Tarefas' else '/crm' end;
      perform private.emit_operational_notification(c.id,'due:'||r.source||':'||r.id||':'||r.due,r.scope||'.overdue',r.scope,r.source,r.id,r.scope,null,
        case when r.responsible is null then 'managers' else 'profile' end,r.responsible,null,
        case when r.scope='finance' then 'Pendência financeira vencida' else 'Tarefa vencida' end,'Abra para verificar a pendência.',dash,dash);
      total:=total+1;
    end loop;
  end loop;
  return total;
end;
$$;
revoke all on function private.detect_operational_notification_due() from public, anon, authenticated;
grant execute on function private.detect_operational_notification_due() to service_role;
