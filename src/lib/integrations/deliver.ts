import { getSql } from "@/lib/db/client"
import { assertSafeWebhookUrl, signWebhookBody } from "./crypto"

interface ClaimedRow {
  id: string
  company_id: string
  endpoint_id: string
  event_type: string
  event_key: string
  payload: Record<string, unknown>
  status: string
  attempts: number
  next_attempt_at: Date | string
  last_error: string | null
  response_status: number | null
  locked_at: Date | string | null
  sent_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

interface EndpointSecretRow {
  id: string
  url: string
  secret: string
  is_active: boolean
  deleted_at: Date | string | null
}

const BACKOFF_MINUTES = [1, 5, 15, 60, 120, 360, 720, 1440]
const MAX_ATTEMPTS = 8
const FETCH_TIMEOUT_MS = 10_000

function backoffMinutes(attempts: number) {
  return BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1440
}

export async function processIntegrationOutbox(batchSize = 25): Promise<{
  processed: number
  sent: number
  failed: number
}> {
  const sql = getSql()
  const claimed = await sql<ClaimedRow[]>`
    select * from public.claim_integration_delivery_batch(${batchSize})
  `

  let sent = 0
  let failed = 0

  for (const row of claimed) {
    const endpoints = await sql<EndpointSecretRow[]>`
      select id, url, secret, is_active, deleted_at
      from public.integration_webhook_endpoints
      where id = ${row.endpoint_id}
      limit 1
    `
    const endpoint = endpoints[0]
    if (!endpoint || !endpoint.is_active || endpoint.deleted_at) {
      await sql`
        update public.integration_delivery_outbox
        set status = 'dead',
            last_error = 'Endpoint inativo ou removido',
            updated_at = now()
        where id = ${row.id}
      `
      failed += 1
      continue
    }

    try {
      assertSafeWebhookUrl(endpoint.url)
      const rawBody = JSON.stringify(row.payload)
      const timestamp = String(Math.floor(Date.now() / 1000))
      const signature = signWebhookBody(endpoint.secret, timestamp, rawBody)

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "AltarChurch-Webhooks/1.0",
            "X-Altar-Event": row.event_type,
            "X-Altar-Delivery-Id": row.id,
            "X-Altar-Timestamp": timestamp,
            "X-Altar-Signature": signature,
          },
          body: rawBody,
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) {
        await sql`
          update public.integration_delivery_outbox
          set status = 'sent',
              response_status = ${response.status},
              last_error = null,
              sent_at = now(),
              updated_at = now()
          where id = ${row.id}
        `
        sent += 1
      } else {
        const bodyPreview = (await response.text().catch(() => "")).slice(0, 300)
        await markFailed(sql, row, `HTTP ${response.status}: ${bodyPreview}`, response.status)
        failed += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no envio"
      await markFailed(sql, row, message, null)
      failed += 1
    }
  }

  return { processed: claimed.length, sent, failed }
}

async function markFailed(
  sql: ReturnType<typeof getSql>,
  row: ClaimedRow,
  lastError: string,
  responseStatus: number | null,
) {
  const attempts = row.attempts
  if (attempts >= MAX_ATTEMPTS) {
    await sql`
      update public.integration_delivery_outbox
      set status = 'dead',
          last_error = ${lastError},
          response_status = ${responseStatus},
          updated_at = now()
      where id = ${row.id}
    `
    return
  }

  const minutes = backoffMinutes(attempts)
  await sql`
    update public.integration_delivery_outbox
    set status = 'failed',
        last_error = ${lastError},
        response_status = ${responseStatus},
        next_attempt_at = now() + (${minutes}::text || ' minutes')::interval,
        updated_at = now()
    where id = ${row.id}
  `
}

export async function retryDelivery(deliveryId: string, companyId: string) {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    update public.integration_delivery_outbox
    set status = 'pending',
        next_attempt_at = now(),
        last_error = null,
        updated_at = now()
    where id = ${deliveryId}
      and company_id = ${companyId}
      and status in ('failed', 'dead', 'sent')
    returning id
  `
  return rows[0]?.id ?? null
}
