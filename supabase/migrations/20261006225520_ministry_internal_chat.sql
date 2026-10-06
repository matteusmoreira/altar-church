-- Conversations belong to ministries, independently of volunteer shifts.
create schema if not exists private;

create function private.ministry_chat_profile_access(target_profile uuid, target_ministry uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join public.ministries m on m.id = target_ministry
    where p.id = target_profile and p.active and p.deleted_at is null
      and m.is_active and m.deleted_at is null
      and (p.company_id = m.company_id or p.role = 'superadmin')
      and (p.role in ('superadmin', 'admin', 'pastor') or exists (
        select 1 from public.ministry_memberships mm join public.people person on person.id = mm.person_id
        where mm.ministry_id = m.id and mm.company_id = m.company_id and mm.status = 'active' and mm.left_at is null
          and person.company_id = m.company_id and person.is_active and person.deleted_at is null and person.status <> 'inactive'
          and (person.profile_id = p.id or person.id = p.person_id)
      ))
  );
$$;
revoke all on function private.ministry_chat_profile_access(uuid, uuid) from public, anon, authenticated;
grant execute on function private.ministry_chat_profile_access(uuid, uuid) to service_role;

create function private.ministry_chat_access(target_ministry uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.ministry_chat_profile_access(p.id, target_ministry)
  from public.profiles p where p.auth_user_id = (select auth.uid()) and p.active and p.deleted_at is null limit 1;
$$;
revoke all on function private.ministry_chat_access(uuid) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.ministry_chat_access(uuid) to authenticated, service_role;

create function private.ministry_chat_own_profile(target_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id = target_profile and p.auth_user_id = (select auth.uid()) and p.active and p.deleted_at is null);
$$;
revoke all on function private.ministry_chat_own_profile(uuid) from public, anon;
grant execute on function private.ministry_chat_own_profile(uuid) to authenticated, service_role;

create table public.ministry_chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id),
  client_id uuid not null,
  body text not null default '' check (char_length(body) <= 5000),
  reply_to_id uuid,
  created_at timestamptz not null default date_trunc('milliseconds', clock_timestamp()),
  edited_at timestamptz,
  deleted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references public.profiles(id),
  unique (ministry_id, sender_profile_id, client_id),
  unique (company_id, ministry_id, id),
  foreign key (company_id, ministry_id, reply_to_id) references public.ministry_chat_messages(company_id, ministry_id, id),
  check (reply_to_id is distinct from id),
  check (deleted_at is null or (body = '' and pinned_at is null))
);
create index ministry_chat_history_idx on public.ministry_chat_messages(ministry_id, created_at desc, id desc);
create index ministry_chat_sender_idx on public.ministry_chat_messages(sender_profile_id);
create index ministry_chat_company_idx on public.ministry_chat_messages(company_id);
create index ministry_chat_reply_idx on public.ministry_chat_messages(reply_to_id) where reply_to_id is not null;
create index ministry_chat_pinned_by_idx on public.ministry_chat_messages(pinned_by) where pinned_by is not null;

create table public.ministry_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id),
  message_id uuid,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  duration_seconds numeric check (duration_seconds > 0 and duration_seconds <= 180),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  foreign key (company_id, ministry_id, message_id) references public.ministry_chat_messages(company_id, ministry_id, id) on delete cascade
);
create index ministry_chat_attachment_message_idx on public.ministry_chat_attachments(message_id);
create index ministry_chat_attachment_owner_idx on public.ministry_chat_attachments(owner_profile_id);
create index ministry_chat_attachment_company_idx on public.ministry_chat_attachments(company_id);
create index ministry_chat_attachment_ministry_idx on public.ministry_chat_attachments(ministry_id);

create table public.ministry_chat_reactions (
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  message_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','🙏','😂','🎉')),
  active boolean not null default true,
  primary key (message_id, profile_id, emoji),
  foreign key (company_id, ministry_id, message_id) references public.ministry_chat_messages(company_id, ministry_id, id) on delete cascade
);
create index ministry_chat_reaction_ministry_idx on public.ministry_chat_reactions(ministry_id);
create index ministry_chat_reaction_company_idx on public.ministry_chat_reactions(company_id);
create index ministry_chat_reaction_profile_idx on public.ministry_chat_reactions(profile_id);

create table public.ministry_chat_reads (
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  last_read_id uuid,
  muted boolean not null default false,
  push_enabled boolean not null default false,
  primary key (ministry_id, profile_id)
);
create index ministry_chat_read_company_idx on public.ministry_chat_reads(company_id);
create index ministry_chat_read_profile_idx on public.ministry_chat_reads(profile_id);

alter table public.notification_push_subscriptions add column profile_id uuid references public.profiles(id) on delete cascade;
alter table public.notification_push_subscriptions alter column person_id drop not null;
update public.notification_push_subscriptions s set profile_id = coalesce(person.profile_id, p.id)
from public.people person left join public.profiles p on p.person_id = person.id and p.company_id = person.company_id and p.deleted_at is null
where s.person_id = person.id and s.company_id = person.company_id;
create index notification_push_profile_idx on public.notification_push_subscriptions(profile_id, company_id) where is_active;
-- Profile-only devices are registered through the session API, not broad company grants.
create policy "Chat devices restrict profile" on public.notification_push_subscriptions as restrictive
for all to authenticated using (profile_id is null or private.ministry_chat_own_profile(profile_id))
with check (profile_id is null or private.ministry_chat_own_profile(profile_id));

create table public.ministry_chat_push_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  message_id uuid not null,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.notification_push_subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed','canceled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (message_id, subscription_id),
  foreign key (company_id, ministry_id, message_id) references public.ministry_chat_messages(company_id, ministry_id, id) on delete cascade
);
create index ministry_chat_push_queue_idx on public.ministry_chat_push_outbox(next_attempt_at, created_at) where status in ('pending','failed','processing');
create index ministry_chat_push_company_idx on public.ministry_chat_push_outbox(company_id);
create index ministry_chat_push_ministry_idx on public.ministry_chat_push_outbox(ministry_id);
create index ministry_chat_push_message_idx on public.ministry_chat_push_outbox(message_id);
create index ministry_chat_push_target_idx on public.ministry_chat_push_outbox(target_profile_id);
create index ministry_chat_push_subscription_idx on public.ministry_chat_push_outbox(subscription_id);

alter table public.ministry_chat_messages enable row level security;
alter table public.ministry_chat_attachments enable row level security;
alter table public.ministry_chat_reactions enable row level security;
alter table public.ministry_chat_reads enable row level security;
alter table public.ministry_chat_push_outbox enable row level security;
create policy "Ministry chat members read" on public.ministry_chat_messages for select to authenticated using (private.ministry_chat_access(ministry_id));
create policy "Ministry chat reactions read" on public.ministry_chat_reactions for select to authenticated using (private.ministry_chat_access(ministry_id));
create policy "Ministry chat own reads" on public.ministry_chat_reads for select to authenticated using (private.ministry_chat_own_profile(profile_id) and private.ministry_chat_access(ministry_id));
-- Attachments/outbox are server-only. Storage has no browser read/update/delete policy.
revoke all on public.ministry_chat_messages, public.ministry_chat_attachments, public.ministry_chat_reactions, public.ministry_chat_reads, public.ministry_chat_push_outbox from anon, authenticated;
grant select on public.ministry_chat_messages, public.ministry_chat_reactions, public.ministry_chat_reads to authenticated;
grant all on public.ministry_chat_messages, public.ministry_chat_attachments, public.ministry_chat_reactions, public.ministry_chat_reads, public.ministry_chat_push_outbox to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('ministry-chat-assets', 'ministry-chat-assets', false, 10485760,
array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','audio/webm','audio/ogg','audio/mp4'])
on conflict (id) do nothing;

do $$ begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.ministry_chat_messages, public.ministry_chat_reactions, public.ministry_chat_reads;
  end if;
end $$;
