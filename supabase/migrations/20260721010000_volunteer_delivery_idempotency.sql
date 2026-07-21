-- Entregas iniciais continuam unicas por escala/voluntario/canal.
-- Lembretes usam notification_key para permitir horas distintas sem duplicacao.
drop index if exists public.volunteer_delivery_assignment_unique_idx;

create unique index volunteer_delivery_assignment_unique_idx
  on public.volunteer_delivery_outbox(assignment_id, volunteer_id, channel)
  where assignment_id is not null and notification_key is null;

create unique index if not exists volunteer_delivery_notification_key_unique_idx
  on public.volunteer_delivery_outbox(notification_key)
  where notification_key is not null;
