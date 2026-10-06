-- Escalas são avisos internos: não gerar lembretes externos nem ausência automática.
-- Mantém o contrato do worker e os registros históricos.
create or replace function public.prepare_volunteer_delivery()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('reminders', 0, 'noShows', 0);
$$;
revoke all on function public.prepare_volunteer_delivery() from public;
grant execute on function public.prepare_volunteer_delivery() to service_role;

-- Interrompe os avisos de escala ainda não enviados; mantém comunicados e histórico entregue.
update public.volunteer_delivery_outbox
set status = 'skipped', locked_at = null,
    last_error = 'Aviso de escala disponível apenas no painel do membro', updated_at = now()
where event_kind in ('schedule', 'reminder')
  and status in ('pending', 'failed', 'processing', 'queued');
