-- kids delivery worker: claim de outbox com SKIP LOCKED + fallback de email para WhatsApp.
-- Migration aditiva: não altera registros existentes.

-- Email alternativo usado quando o WhatsApp falha definitivamente (somente quando autorizado).
alter table public.kid_delivery_outbox add column if not exists fallback_email text;

-- Claim atômico de lote: pending/failed vencidos, com backoff e limite de tentativas.
create or replace function public.claim_kid_delivery_batch(batch_size integer default 25)
returns setof public.kid_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id
    from public.kid_delivery_outbox
    where status in ('pending', 'failed')
      and next_attempt_at <= now()
      and attempts < 8
    order by next_attempt_at
    limit greatest(1, least(batch_size, 100))
    for update skip locked
  )
  update public.kid_delivery_outbox outbox
  set status = 'processing',
      attempts = outbox.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from claimed
  where outbox.id = claimed.id
  returning outbox.*;
end;
$$;

revoke all on function public.claim_kid_delivery_batch(integer) from public;
grant execute on function public.claim_kid_delivery_batch(integer) to service_role;
grant execute on function public.claim_kid_delivery_batch(integer) to authenticated;
