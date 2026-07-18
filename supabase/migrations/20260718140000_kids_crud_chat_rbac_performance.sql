-- Kids: responsável compartilhado, chat interno, ministério responsável e buscas rápidas.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.kids_normalize_name(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent', coalesce(value, '')))
$$;

alter table public.kid_settings
  add column if not exists ministry_id uuid references public.ministries(id) on delete set null;

create index if not exists kid_settings_ministry_idx
  on public.kid_settings(ministry_id)
  where ministry_id is not null;

create or replace function public.kids_can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.auth_user_id = (select auth.uid())
      and profile.active = true
      and (
        profile.role in ('admin', 'pastor')
        or (
          profile.role = 'ministry_leader'
          and exists (
            select 1
            from public.ministries ministry
            join public.kid_settings settings on settings.ministry_id = ministry.id
              and settings.company_id = profile.company_id
              and settings.congregation_id is null
            where ministry.leader_person_id = profile.person_id
              and ministry.company_id = profile.company_id
              and ministry.deleted_at is null
              and ministry.is_active = true
          )
        )
      )
  )
$$;

revoke all on function public.kids_can_manage() from public;
grant execute on function public.kids_can_manage() to authenticated;

create index if not exists people_company_name_trgm_idx
  on public.people using gin (public.kids_normalize_name(full_name) extensions.gin_trgm_ops)
  where deleted_at is null;

create index if not exists people_company_phone_digits_idx
  on public.people(company_id, (regexp_replace(phone, '\D', '', 'g')))
  where deleted_at is null and phone <> '';

create table if not exists public.kid_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  guardian_person_id uuid not null references public.people(id) on delete restrict,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  status text not null default 'open',
  staff_read_at timestamptz,
  guardian_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_conversations_status_check check (status in ('open', 'closed'))
);

create unique index if not exists kid_conversations_guardian_active_unique_idx
  on public.kid_conversations(company_id, guardian_person_id)
  where deleted_at is null;
create index if not exists kid_conversations_company_last_idx
  on public.kid_conversations(company_id, last_message_at desc)
  where deleted_at is null;
create index if not exists kid_conversations_guardian_person_idx
  on public.kid_conversations(guardian_person_id, last_message_at desc)
  where deleted_at is null;

create table if not exists public.kid_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null references public.kid_conversations(id) on delete cascade,
  kid_id uuid references public.kid_profiles(id) on delete set null,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  sender_kind text not null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kid_conversation_messages_sender_check check (sender_kind in ('staff', 'guardian')),
  constraint kid_conversation_messages_body_check check (length(trim(body)) between 1 and 2000)
);

create index if not exists kid_conversation_messages_conversation_idx
  on public.kid_conversation_messages(conversation_id, created_at)
  where deleted_at is null;
create index if not exists kid_conversation_messages_company_idx
  on public.kid_conversation_messages(company_id, created_at desc)
  where deleted_at is null;

drop trigger if exists kid_conversations_set_updated_at on public.kid_conversations;
create trigger kid_conversations_set_updated_at
before update on public.kid_conversations
for each row execute function public.set_updated_at();

alter table public.kid_conversations enable row level security;
alter table public.kid_conversation_messages enable row level security;

drop policy if exists "kid_conversations staff access" on public.kid_conversations;
create policy "kid_conversations staff access"
on public.kid_conversations for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_can_manage())))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_can_manage())));

drop policy if exists "kid_conversations guardian access" on public.kid_conversations;
create policy "kid_conversations guardian access"
on public.kid_conversations for select to authenticated
using (
  (select public.kids_is_guardian())
  and exists (
    select 1 from public.kid_guardians guardian
    where guardian.person_id = guardian_person_id
      and guardian.profile_id = (select public.kids_current_profile_id())
      and guardian.deleted_at is null
  )
);

drop policy if exists "kid_conversation_messages staff access" on public.kid_conversation_messages;
create policy "kid_conversation_messages staff access"
on public.kid_conversation_messages for all to authenticated
using ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_can_manage())))
with check ((select public.is_superadmin()) or ((select public.is_company_member(company_id)) and (select public.kids_can_manage())));

drop policy if exists "kid_conversation_messages guardian read" on public.kid_conversation_messages;
create policy "kid_conversation_messages guardian read"
on public.kid_conversation_messages for select to authenticated
using (
  (select public.kids_is_guardian())
  and exists (
    select 1
    from public.kid_conversations conversation
    join public.kid_guardians guardian on guardian.person_id = conversation.guardian_person_id
    where conversation.id = conversation_id
      and conversation.deleted_at is null
      and guardian.profile_id = (select public.kids_current_profile_id())
      and guardian.deleted_at is null
  )
);

grant select, insert, update, delete on public.kid_conversations to authenticated;
grant select, insert, update, delete on public.kid_conversation_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kid_conversation_messages'
  ) then
    alter publication supabase_realtime add table public.kid_conversation_messages;
  end if;
end $$;
