-- Públicos adicionais da comunicação de Eventos.
alter table public.notifications drop constraint if exists notifications_audience_kind_check;
alter table public.notifications
  add constraint notifications_audience_kind_check
  check (audience_kind in (
    'all', 'cell', 'ministry', 'ministry_team', 'visitors', 'birthdays', 'manual',
    'event_going', 'event_waitlist', 'event_guests', 'event_volunteers', 'event_all',
    'event_ministry', 'event_public'
  ));
