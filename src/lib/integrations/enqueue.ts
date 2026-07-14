import { getSql } from "@/lib/db/client"
import { buildEventEnvelope } from "./events"
import type { IntegrationEventType } from "./types"

interface EndpointRow {
  id: string
  company_id: string
  form_id: string | null
  url: string
  secret: string
  events: string[]
}

export interface EnqueueIntegrationEventInput {
  companyId: string
  companySlug?: string
  companyName?: string
  formId?: string | null
  eventType: IntegrationEventType
  eventKey: string
  data: Record<string, unknown>
  /** When true, only form-scoped endpoints (or only global if formId null). Default resolve both. */
  formScopedOnly?: boolean
}

/**
 * Resolve active endpoints and insert outbox rows (idempotent on endpoint_id + event_key).
 * Never throws to callers for delivery concerns — returns count enqueued.
 */
export async function enqueueIntegrationEvent(
  input: EnqueueIntegrationEventInput,
): Promise<{ enqueued: number }> {
  try {
    const sql = getSql()
    const formId = input.formId ?? null

    const endpoints = formId
      ? await sql<EndpointRow[]>`
          select id, company_id, form_id, url, secret, events
          from public.integration_webhook_endpoints
          where company_id = ${input.companyId}
            and deleted_at is null
            and is_active = true
            and ${input.eventType} = any(events)
            and (form_id is null or form_id = ${formId})
        `
      : await sql<EndpointRow[]>`
          select id, company_id, form_id, url, secret, events
          from public.integration_webhook_endpoints
          where company_id = ${input.companyId}
            and deleted_at is null
            and is_active = true
            and ${input.eventType} = any(events)
            and form_id is null
        `

    if (endpoints.length === 0) return { enqueued: 0 }

    let enqueued = 0
    for (const endpoint of endpoints) {
      // Placeholder delivery id; will be replaced after insert for envelope id field
      const provisionalId = crypto.randomUUID()
      const envelope = buildEventEnvelope({
        deliveryId: provisionalId,
        type: input.eventType,
        company: {
          id: input.companyId,
          slug: input.companySlug,
          name: input.companyName,
        },
        data: input.data,
      })

      const rows = await sql<{ id: string }[]>`
        insert into public.integration_delivery_outbox (
          id, company_id, endpoint_id, event_type, event_key, payload, status, next_attempt_at
        )
        values (
          ${provisionalId},
          ${input.companyId},
          ${endpoint.id},
          ${input.eventType},
          ${input.eventKey},
          ${JSON.stringify(envelope)}::jsonb,
          'pending',
          now()
        )
        on conflict (endpoint_id, event_key) do nothing
        returning id
      `
      if (rows[0]?.id) enqueued += 1
    }

    return { enqueued }
  } catch (error) {
    console.error("[integrations] enqueue failed", error)
    return { enqueued: 0 }
  }
}

/** Fire-and-forget safe wrapper for mutation paths. */
export function enqueueIntegrationEventSafe(input: EnqueueIntegrationEventInput) {
  return enqueueIntegrationEvent(input).catch((error) => {
    console.error("[integrations] enqueue safe failed", error)
    return { enqueued: 0 }
  })
}
