-- Kids staff and scoped leaders can open the authorized subject without entering
-- the administrative dashboard. Sensitive content still passes source access.
create function private.notification_subject_route() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.module='kids' and new.source_table in ('kid_conversation_messages','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions') then
    new.href:='/notificacoes/'||new.id;
  end if;
  if new.module='events' and new.kind in ('event.changed','event.registration') then new.href:='/notificacoes/'||new.id; end if;
  return new;
end;
$$;
revoke all on function private.notification_subject_route() from public,anon,authenticated;
create trigger notification_subject_route before insert on public.notification_inbox
for each row execute function private.notification_subject_route();
update public.notification_inbox set href='/notificacoes/'||id where module='kids'
  and source_table in ('kid_conversation_messages','kid_incidents','kid_attendances','kid_staff_assignments','kid_sessions');
update public.notification_inbox set href='/notificacoes/'||id where module='events' and kind in ('event.changed','event.registration');

-- Reuse older volunteer device registrations; do not reactivate or move an
-- endpoint already registered in the common subscription table.
do $$
begin
  if to_regclass('public.volunteer_push_subscriptions') is not null then
    insert into public.notification_push_subscriptions(company_id,profile_id,person_id,endpoint,p256dh,auth_key,user_agent,is_active)
    select s.company_id,p.id,person.id,s.endpoint,s.p256dh,s.auth_key,s.user_agent,true
    from public.volunteer_push_subscriptions s
    left join public.volunteer_profiles v on v.id=s.volunteer_id and v.company_id=s.company_id and v.deleted_at is null
    join public.people person on person.id=v.person_id and person.company_id=s.company_id and person.deleted_at is null and person.is_active
    join public.profiles p on p.id=person.profile_id and p.company_id=s.company_id and p.active and p.deleted_at is null
    where s.is_active on conflict(endpoint) do nothing;
  end if;
end;
$$;
