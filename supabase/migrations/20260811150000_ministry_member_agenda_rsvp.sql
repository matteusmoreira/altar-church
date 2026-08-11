-- Atividades materializadas pela agenda de ministérios devem aceitar RSVP
-- dos membros ativos do próprio ministério no Portal do Membro.

create or replace function public.enable_materialized_ministry_event_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.programming_id is not null and new.ministry_id is not null then
    new.registration_enabled := true;
  end if;
  return new;
end;
$$;

revoke all on function public.enable_materialized_ministry_event_rsvp() from public, anon, authenticated;

-- O nome mantém este trigger depois de events_sync_ministry_id na ordem alfabética,
-- para que new.ministry_id já esteja preenchido a partir de programming_id.
drop trigger if exists events_sync_ministry_rsvp on public.events;
create trigger events_sync_ministry_rsvp
before insert or update of programming_id, ministry_id on public.events
for each row execute function public.enable_materialized_ministry_event_rsvp();

update public.events
set registration_enabled = true,
    updated_at = now()
where programming_id is not null
  and ministry_id is not null
  and deleted_at is null
  and registration_enabled = false;

analyze public.events;
