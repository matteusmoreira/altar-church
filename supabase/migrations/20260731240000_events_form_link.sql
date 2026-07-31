-- Vínculo opcional do evento ao formulário público existente.
alter table public.events
  add column if not exists registration_form_id uuid references public.forms(id) on delete set null;

create index if not exists events_registration_form_fk_idx
  on public.events(registration_form_id)
  where registration_form_id is not null;

analyze public.events;
