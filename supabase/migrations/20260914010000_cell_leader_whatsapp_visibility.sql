-- Preserve existing public contacts; each cell can opt out in its form.
alter table public.groups
  add column if not exists is_leader_whatsapp_public boolean not null default true;
