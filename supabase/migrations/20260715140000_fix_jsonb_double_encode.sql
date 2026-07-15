-- Fix double-encoded jsonb (stored as jsonb *string* of JSON text).
-- Caused by ${JSON.stringify(x)}::jsonb with the postgres.js driver.
-- Symptoms: form Envios showed {}; webhooks sent invalid body to Altar Chat.

-- form_submissions.payload: string → object
update public.form_submissions
set payload = (payload #>> '{}')::jsonb
where jsonb_typeof(payload) = 'string'
  and (payload #>> '{}') is not null
  and left(payload #>> '{}', 1) in ('{', '[');

-- integration_delivery_outbox.payload: string → object
update public.integration_delivery_outbox
set payload = (payload #>> '{}')::jsonb
where jsonb_typeof(payload) = 'string'
  and (payload #>> '{}') is not null
  and left(payload #>> '{}', 1) in ('{', '[');

-- SQL worker: send real JSON object body (unwrap string payloads if any remain)
create or replace function public.process_integration_deliveries(batch_size integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, net
as $$
declare
  r public.integration_delivery_outbox%rowtype;
  endpoint public.integration_webhook_endpoints%rowtype;
  body_json jsonb;
  raw_body text;
  ts text;
  sig text;
  req_id bigint;
  processed int := 0;
  sent int := 0;
  failed int := 0;
  err text;
  host text;
  minutes int;
  backoff int[] := array[1, 5, 15, 60, 120, 360, 720, 1440];
begin
  for r in
    select * from public.claim_integration_delivery_batch(greatest(1, least(coalesce(batch_size, 25), 100)))
  loop
    processed := processed + 1;
    begin
      select * into endpoint
      from public.integration_webhook_endpoints e
      where e.id = r.endpoint_id;

      if endpoint.id is null or endpoint.deleted_at is not null or endpoint.is_active is not true then
        update public.integration_delivery_outbox
        set status = 'dead',
            last_error = 'Endpoint inativo ou removido',
            updated_at = now()
        where id = r.id;
        failed := failed + 1;
        continue;
      end if;

      if endpoint.url !~* '^https://' then
        raise exception 'Webhook deve usar HTTPS';
      end if;

      host := lower(substring(endpoint.url from 'https?://([^/]+)'));
      if host in ('localhost', '127.0.0.1', '0.0.0.0', '[::1]')
         or host ~ '^10\.'
         or host ~ '^192\.168\.'
         or host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.'
         or host ~ '^169\.254\.'
      then
        raise exception 'URL de webhook não pode apontar para rede privada';
      end if;

      -- unwrap double-encoded string payloads
      if jsonb_typeof(r.payload) = 'string' then
        body_json := (r.payload #>> '{}')::jsonb;
      else
        body_json := r.payload;
      end if;
      raw_body := body_json::text;
      ts := floor(extract(epoch from clock_timestamp()))::bigint::text;
      sig := 'sha256=' || encode(
        extensions.hmac(
          convert_to(ts || '.' || raw_body, 'UTF8'),
          convert_to(endpoint.secret, 'UTF8'),
          'sha256'
        ),
        'hex'
      );

      req_id := net.http_post(
        url := endpoint.url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'User-Agent', 'AltarChurch-Webhooks/1.0',
          'X-Altar-Event', r.event_type,
          'X-Altar-Delivery-Id', r.id::text,
          'X-Altar-Timestamp', ts,
          'X-Altar-Signature', sig
        ),
        body := body_json,
        timeout_milliseconds := 10000
      );

      -- pg_net is async: mark as sent after enqueue (status 0 = not awaited)
      update public.integration_delivery_outbox
      set status = 'sent',
          response_status = 0,
          last_error = null,
          sent_at = now(),
          updated_at = now()
      where id = r.id;

      sent := sent + 1;
    exception when others then
      err := left(sqlerrm, 500);
      if r.attempts >= 8 then
        update public.integration_delivery_outbox
        set status = 'dead',
            last_error = err,
            updated_at = now()
        where id = r.id;
      else
        minutes := backoff[least(r.attempts, array_length(backoff, 1))];
        update public.integration_delivery_outbox
        set status = 'failed',
            last_error = err,
            next_attempt_at = now() + (minutes::text || ' minutes')::interval,
            updated_at = now()
        where id = r.id;
      end if;
      failed := failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'processed', processed,
    'sent', sent,
    'failed', failed
  );
end;
$$;
