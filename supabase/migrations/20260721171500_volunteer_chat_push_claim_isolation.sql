-- Entregas de chat por perfil são processadas pelo worker Vercel.
-- Worker legado continua responsável pelas entregas ligadas a voluntário.
create or replace function public.claim_volunteer_delivery_batch(batch_size integer default 25)
returns setof public.volunteer_delivery_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select id
    from public.volunteer_delivery_outbox
    where status in ('pending', 'failed')
      and chat_message_id is null
      and next_attempt_at <= now()
      and attempts < 8
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.volunteer_delivery_outbox delivery
  set status = 'processing',
      attempts = delivery.attempts + 1,
      locked_at = now(),
      updated_at = now()
  from candidates
  where delivery.id = candidates.id
  returning delivery.*;
end;
$$;

revoke all on function public.claim_volunteer_delivery_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_volunteer_delivery_batch(integer) to service_role, postgres;
