-- Voluntariado: leitura persistente do chat e Web Push por perfil.

create table if not exists public.volunteer_shift_conversation_reads (
  conversation_id uuid not null references public.volunteer_shift_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create index if not exists volunteer_shift_conversation_reads_profile_idx
  on public.volunteer_shift_conversation_reads(profile_id, last_read_at desc);

alter table public.volunteer_shift_conversation_reads enable row level security;

drop policy if exists "volunteer conversation reads own" on public.volunteer_shift_conversation_reads;
create policy "volunteer conversation reads own"
on public.volunteer_shift_conversation_reads for all to authenticated
using (exists (
  select 1 from public.profiles profile
  where profile.id = profile_id and profile.auth_user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.profiles profile
  where profile.id = profile_id and profile.auth_user_id = (select auth.uid())
));

alter table public.volunteer_push_subscriptions
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;

update public.volunteer_push_subscriptions subscription
set profile_id = coalesce(person.profile_id, profile.id)
from public.volunteer_profiles volunteer
join public.people person on person.id = volunteer.person_id
left join public.profiles profile
  on profile.company_id = volunteer.company_id
 and profile.person_id = volunteer.person_id
 and profile.active
where subscription.volunteer_id = volunteer.id
  and subscription.profile_id is null;

alter table public.volunteer_push_subscriptions
  alter column volunteer_id drop not null;

alter table public.volunteer_push_subscriptions
  drop constraint if exists volunteer_push_subscription_owner_check;
alter table public.volunteer_push_subscriptions
  add constraint volunteer_push_subscription_owner_check
  check (volunteer_id is not null or profile_id is not null);

create index if not exists volunteer_push_subscriptions_profile_idx
  on public.volunteer_push_subscriptions(profile_id)
  where profile_id is not null and is_active;

alter table public.volunteer_delivery_outbox
  add column if not exists chat_message_id uuid references public.volunteer_shift_messages(id) on delete cascade,
  add column if not exists target_profile_id uuid references public.profiles(id) on delete cascade;

alter table public.volunteer_delivery_outbox
  alter column volunteer_id drop not null;

alter table public.volunteer_delivery_outbox
  drop constraint if exists volunteer_delivery_recipient_check;
alter table public.volunteer_delivery_outbox
  add constraint volunteer_delivery_recipient_check
  check (volunteer_id is not null or target_profile_id is not null);

alter table public.volunteer_delivery_outbox
  drop constraint if exists volunteer_delivery_source_check;
alter table public.volunteer_delivery_outbox
  add constraint volunteer_delivery_source_check
  check (num_nonnulls(feed_post_id, assignment_id, recognition_id, chat_message_id) = 1);

create unique index if not exists volunteer_delivery_chat_profile_unique_idx
  on public.volunteer_delivery_outbox(chat_message_id, target_profile_id, channel)
  where chat_message_id is not null and target_profile_id is not null;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'volunteer_shift_conversation_reads'
    ) then
    alter publication supabase_realtime add table public.volunteer_shift_conversation_reads;
  end if;
end $$;

analyze public.volunteer_shift_conversation_reads;
analyze public.volunteer_push_subscriptions;
analyze public.volunteer_delivery_outbox;
