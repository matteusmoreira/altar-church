-- Keep applied migrations immutable; refine current source access and volunteer scope.
create or replace function private.notification_subject_route() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.module='kids' and new.source_table in ('kid_conversation_messages','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions'))
    or (new.module='events' and new.kind in ('event.changed','event.registration'))
    or new.kind='volunteer.registration' then new.href:='/notificacoes/'||new.id; end if;
  return new;
end;
$$;
create table private.notification_release_state(singleton boolean primary key default true check(singleton), started_at timestamptz not null default now());
insert into private.notification_release_state(singleton) values(true);
alter table private.notification_release_state enable row level security;
-- Scheduled publications are checked every worker run, independently of daily overdue checks.
create function private.detect_operational_notification_publications() returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; target record; total integer:=0;
begin
  for r in select a.* from public.announcements a join public.companies c on c.id=a.company_id and c.active
    where a.deleted_at is null and a.published and a.published_at<=now()
      and a.published_at>=(select started_at from private.notification_release_state where singleton)
      and not exists(select 1 from public.notification_inbox n where n.company_id=a.company_id and n.source_id=a.id and n.source_table='announcements' and n.kind='announcement.published') loop
    perform private.emit_operational_notification(r.company_id,'announcement.publication:'||r.id,'announcement.published','content','announcements',r.id,'content',null,'all',null,coalesce(r.updated_by,r.author_id,r.created_by),
      'Novo comunicado',r.title,'/dashboard','/membro');total:=total+1;
  end loop;
  for r in select notice.* from public.cell_notices notice join public.companies c on c.id=notice.company_id and c.active
    where notice.deleted_at is null and notice.is_active and notice.published_at<=now()
      and notice.published_at>=(select started_at from private.notification_release_state where singleton)
      and not exists(select 1 from public.notification_inbox n where n.company_id=notice.company_id and n.source_id=notice.id and n.source_table='cell_notices' and n.kind='announcement.published') loop
    for target in select distinct gm.person_id,gm.group_id from public.group_members gm join public.groups g on g.id=gm.group_id and g.company_id=r.company_id and g.type='cell' and g.is_active and g.deleted_at is null
      where gm.company_id=r.company_id and gm.status='active' and gm.left_at is null
        and (r.audience='all' or exists(select 1 from public.cell_notice_targets t where t.notice_id=r.id and t.company_id=r.company_id and t.group_id=gm.group_id)) loop
      perform private.emit_operational_notification(r.company_id,'cell.notice:'||r.id,'announcement.published','cells','cell_notices',r.id,'cell',target.group_id,'person',target.person_id,r.author_profile_id,
        'Novo comunicado da célula',r.title,'/celulas?group='||target.group_id,'/membro/celulas?group='||target.group_id);
    end loop;total:=total+1;
  end loop;
  -- A future announcement may have been enqueued at scheduling time and canceled
  -- by source revalidation. Restore only authorized, unread, active-device pushes.
  update private.notification_inbox_push q set status='pending',next_attempt_at=now(),attempts=0
    from public.notification_inbox n join public.announcements a on a.id=n.source_id and a.company_id=n.company_id
    join public.notification_push_subscriptions s on s.company_id=n.company_id and s.profile_id=n.profile_id and s.is_active
    where q.inbox_id=n.id and q.subscription_id=s.id and q.status='canceled' and n.read_at is null and n.source_table='announcements'
      and a.published_at<now() and a.published_at>=(select started_at from private.notification_release_state where singleton)
      and private.notification_source_access(n)
      and not exists(select 1 from public.notification_channel_preferences pref where pref.company_id=n.company_id and pref.person_id=s.person_id and pref.channel='push' and pref.opted_out);
  return total;
end;
$$;
revoke all on function private.detect_operational_notification_publications() from public,anon,authenticated;
grant execute on function private.detect_operational_notification_publications() to service_role;
-- Registration decisions reach the person; requests also reach the responsible department.
create function private.route_volunteer_registration_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v public.volunteer_profiles%rowtype; department uuid; event_key text; actor uuid;
begin
  if tg_table_name='volunteer_profiles' then
    v:=new;
    if tg_op='UPDATE' and new.registration_status=old.registration_status then return null; end if;
    if tg_op='INSERT' and v.registration_status <> 'pending' then return null; end if;
  else
    if not new.is_active then return null; end if;
    select * into v from public.volunteer_profiles where id=new.volunteer_id and company_id=new.company_id;
    if v.registration_status <> 'pending' then return null; end if;
  end if;
  if v.deleted_at is not null then return null; end if;
  actor:=coalesce(v.updated_by,v.created_by);
  event_key:='volunteer.registration:'||v.id||':'||v.registration_status||':'||v.updated_at;
  perform private.emit_operational_notification(v.company_id,event_key,'volunteer.registration','volunteers','volunteer_profiles',v.id,'volunteers',null,'managers',null,actor,
    'Participação no voluntariado','Confira o pedido e a situação do cadastro.','/voluntariado','/membro/voluntariado');
  for department in select distinct department_id from public.volunteer_department_memberships where company_id=v.company_id and volunteer_id=v.id and is_active loop
    perform private.emit_operational_notification(v.company_id,event_key,'volunteer.registration','volunteers','volunteer_profiles',v.id,'department',department,'managers',null,actor,
      'Participação no voluntariado','Confira o pedido de participação.','/voluntariado','/membro/voluntariado');
  end loop;
  if tg_table_name='volunteer_profiles' and tg_op='UPDATE' then
    perform private.emit_operational_notification(v.company_id,event_key,'volunteer.registration','volunteers','volunteer_profiles',v.id,'volunteers',null,'person',v.person_id,actor,
      'Seu pedido de voluntariado foi atualizado','Abra para conferir sua participação.','/voluntariado','/membro/voluntariado');
  end if;
  return null;
end;
$$;
revoke all on function private.route_volunteer_registration_notification() from public,anon,authenticated;
create trigger notification_registration after insert or update on public.volunteer_profiles for each row execute function private.route_volunteer_registration_notification();
create trigger notification_registration after insert or update on public.volunteer_department_memberships for each row execute function private.route_volunteer_registration_notification();
create or replace function private.notification_recipient_access(target uuid, company uuid, scope text, scope_id uuid, audience text, subject uuid)
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
  elsif scope='department' then
    return exists(select 1 from public.volunteer_department_access a where a.company_id=company and a.department_id=scope_id and a.profile_id=target)
      or exists(select 1 from public.volunteer_departments d where d.id=scope_id and d.company_id=company and d.deleted_at is null
        and (d.manager_profile_id=target or (d.ministry_id is not null and private.notification_recipient_access(target,company,'ministry',d.ministry_id,'managers',null))));
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

create or replace function private.notification_source_access(item public.notification_inbox)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare row_data jsonb; event_data jsonb;
begin
  if not private.notification_recipient_access(item.profile_id,item.company_id,item.scope_kind,item.scope_id,item.audience,item.subject_id) then return false; end if;
  if item.source_table not in ('ministry_chat_messages','volunteer_shift_messages','kid_conversation_messages','ministry_memberships','group_members',
    'volunteer_profiles','volunteer_department_memberships','volunteer_assignments','volunteer_swap_requests','events','member_event_rsvps','event_guest_registrations','event_registrations',
    'form_submissions','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions','cell_visit_requests',
    'automation_tasks','person_follow_up_tasks','automation_runs','prayer_requests','cell_prayer_requests','announcements','cell_notices',
    'volunteer_shifts','volunteer_schedules','revenues','expenses','notification_deliveries','integration_delivery_outbox','form_whatsapp_deliveries','automation_deliveries','volunteer_delivery_outbox','kid_delivery_outbox','cell_whatsapp_deliveries') then return false; end if;
  execute format('select to_jsonb(s) from public.%I s where id=$1 and company_id=$2',item.source_table)
    into row_data using item.source_id,item.company_id;
  if row_data is null or row_data->>'deleted_at' is not null then return false; end if;
  if item.source_table='announcements' and (not coalesce((row_data->>'published')::boolean,false) or (row_data->>'published_at')::timestamptz>now()) then return false; end if;
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
    return exists(select 1 from public.member_event_rsvps where company_id=item.company_id and event_id=item.source_id and person_id=item.subject_id and (status <> 'canceled' or row_data->>'status' in ('canceled','cancelled')))
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
