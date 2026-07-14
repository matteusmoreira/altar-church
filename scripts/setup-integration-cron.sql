-- Cron de integrações (worker SQL no Postgres)
-- Preferido: chama process_integration_deliveries a cada 2 minutos (pg_net + HMAC).
-- Pré-requisitos: migrations 20260715120000 + 20260715130000 aplicadas.

-- Remove job antigo (HTTP edge/next) se existir
select cron.unschedule(jobname)
from (
  select jobname
  from cron.job
  where jobname = 'integration-delivery-dispatch-every-2-minutes'
) j;

select cron.schedule(
  'integration-delivery-dispatch-every-2-minutes',
  '*/2 * * * *',
  $$select public.process_integration_deliveries(25);$$
);

-- Conferir
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'integration-delivery-dispatch-every-2-minutes';

-- Smoke (opcional)
-- select public.process_integration_deliveries(5);
