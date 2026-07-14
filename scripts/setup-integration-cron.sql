-- Cron para despachar outbox de integrações (pg_cron + pg_net + Vault)
-- Pré-requisitos no Supabase:
--   1. Extensões pg_cron e pg_net habilitadas
--   2. Secrets no Vault:
--        integration_dispatch_url  = https://SEU_DOMINIO/api/internal/integrations/dispatch
--        integration_worker_secret = mesmo valor de INTEGRATION_WORKER_SECRET
--
-- Criar secrets (exemplo; use o dashboard Vault ou a API do Supabase):
--   select vault.create_secret('https://app.example.com/api/internal/integrations/dispatch', 'integration_dispatch_url');
--   select vault.create_secret('seu-secret-longo', 'integration_worker_secret');

-- Remove job antigo se existir
select cron.unschedule(jobid)
from cron.job
where jobname = 'integration-delivery-dispatch-every-2-minutes';

select cron.schedule(
  'integration-delivery-dispatch-every-2-minutes',
  '*/2 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'integration_dispatch_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-integration-worker-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'integration_worker_secret')
      ),
      body := '{"batchSize":25}'::jsonb
    );
  $$
);

-- Conferir
select jobid, jobname, schedule, command
from cron.job
where jobname = 'integration-delivery-dispatch-every-2-minutes';
