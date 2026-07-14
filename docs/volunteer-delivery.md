# Entrega de avisos do voluntariado

Worker: `supabase/functions/volunteer-delivery-worker`.

## Segredos da Edge Function

Configure somente no Supabase. Nunca em arquivos versionados:

```bash
supabase secrets set \
  VOLUNTEER_WORKER_SECRET=... \
  UAZAPI_BASE_URL=https://... \
  UAZAPI_INSTANCE_TOKEN=... \
  RESEND_API_KEY=re_... \
  RESEND_FROM_EMAIL='Altar Church <avisos@seu-dominio.com>'

supabase functions deploy volunteer-delivery-worker
```

## Cron a cada cinco minutos

No SQL Editor, habilite `pg_cron`, `pg_net` e Vault. Crie segredos `volunteer_worker_url`, `supabase_service_role_key` e `volunteer_worker_secret` no Vault. Valores: URL da função, service-role key, mesmo segredo do worker.

```sql
select cron.schedule(
  'volunteer-delivery-worker-every-5-minutes',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'volunteer_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
        'x-volunteer-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'volunteer_worker_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Worker usa outbox persistida, tentativas exponenciais, chave idempotente Resend e `track_id` Uazapi. WhatsApp assíncrono fica `queued`; worker consulta Uazapi depois para marcar entrega/falha.

## Webhook Resend

Cadastre `https://seu-dominio/api/webhooks/resend` no Resend para `email.delivered`, `email.bounced`, `email.complained`, `email.failed` e `email.suppressed`. Salve signing secret como `RESEND_WEBHOOK_SECRET` no runtime Next.js. Handler valida corpo bruto Svix e ignora eventos repetidos.
