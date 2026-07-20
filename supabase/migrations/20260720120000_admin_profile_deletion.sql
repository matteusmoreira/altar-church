-- Keep Kids chat history when a SuperAdmin permanently removes a user profile.
alter table public.kid_conversation_messages
  alter column sender_profile_id drop not null;

alter table public.kid_conversation_messages
  drop constraint if exists kid_conversation_messages_sender_profile_id_fkey;

alter table public.kid_conversation_messages
  add constraint kid_conversation_messages_sender_profile_id_fkey
  foreign key (sender_profile_id)
  references public.profiles(id)
  on delete set null;
