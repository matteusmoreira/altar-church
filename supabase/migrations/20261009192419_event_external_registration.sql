begin;

alter table public.events
  add column registration_mode text not null default 'internal',
  add column external_platform text not null default 'Sympla',
  add column external_ticket_url text not null default '',
  add constraint event_registration_mode_check check (registration_mode in ('internal', 'external')),
  add constraint event_external_registration_check check (
    registration_mode <> 'external' or (
      not registration_enabled and not allow_walk_ins
      and length(btrim(external_platform)) between 2 and 80
      and length(external_ticket_url) <= 2000 and external_ticket_url ~ '^https://[^[:space:]]+$'
    )
  );

-- UPDATE holds the same event row lock used by registration and session creation.
create function public.guard_event_external_registration() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.registration_mode = 'external' and old.registration_mode <> 'external' then
    if exists(select 1 from public.member_event_rsvps where company_id = new.company_id and event_id = new.id and status in ('going', 'waitlisted'))
      or exists(select 1 from public.event_guest_registrations where company_id = new.company_id and event_id = new.id and status in ('going', 'waitlisted')) then
      raise exception 'Cancele as inscrições internas confirmadas e em espera antes de mudar para plataforma externa';
    end if;
    if exists(select 1 from public.event_checkin_sessions where company_id = new.company_id and event_id = new.id and closed_at is null) then
      raise exception 'Encerre as sessões de check-in antes de mudar para plataforma externa';
    end if;
  end if;
  return new;
end;
$$;
create trigger guard_event_external_registration before update of registration_mode on public.events
for each row execute function public.guard_event_external_registration();

-- Occurrences materialized later inherit external ticketing from their source event.
create function public.inherit_event_external_registration() returns trigger
language plpgsql set search_path = '' as $$
declare source public.events%rowtype;
begin
  if new.programming_id is not null and new.registration_mode = 'internal' then
    select event.* into source from public.programmings programming
      join public.events event on event.id = programming.source_event_id and event.company_id = programming.company_id
      where programming.id = new.programming_id and programming.company_id = new.company_id
        and event.registration_mode = 'external' and event.deleted_at is null;
    if found then
      new.registration_mode := source.registration_mode;
      new.external_platform := source.external_platform;
      new.external_ticket_url := source.external_ticket_url;
      new.registration_enabled := false;
      new.allow_walk_ins := false;
      new.value_cents := source.value_cents;
      new.value_instructions := source.value_instructions;
    end if;
  end if;
  return new;
end;
$$;
create trigger inherit_event_external_registration before insert on public.events
for each row execute function public.inherit_event_external_registration();

commit;
