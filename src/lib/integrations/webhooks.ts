import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { parseJsonbObject } from "@/lib/db/jsonb"
import type { DeliveryRow, IntegrationEventType, WebhookEndpoint } from "./types"

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString()
  return value
}

function mapEndpoint(row: {
  id: string
  company_id: string
  form_id: string | null
  name: string
  url: string
  events: string[]
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
}): WebhookEndpoint {
  return {
    id: row.id,
    companyId: row.company_id,
    formId: row.form_id,
    name: row.name,
    url: row.url,
    events: row.events as IntegrationEventType[],
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function listWebhookEndpoints(input?: {
  companyId?: string | null
  formId?: string | null
  /** When true, only global (form_id is null). When formId set, only that form. */
  globalOnly?: boolean
}): Promise<WebhookEndpoint[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, input?.companyId)
  if (input?.formId) {
    await requirePermission("forms.view", companyId)
  } else {
    await requirePermission("settings.manage_settings", companyId)
  }
  const sql = getSql()

  type EndpointRow = {
    id: string
    company_id: string
    form_id: string | null
    name: string
    url: string
    events: string[]
    is_active: boolean
    created_at: Date | string
    updated_at: Date | string
  }

  if (input?.formId) {
    const rows = await sql<EndpointRow[]>`
      select id, company_id, form_id, name, url, events, is_active, created_at, updated_at
      from public.integration_webhook_endpoints
      where company_id = ${companyId}
        and form_id = ${input.formId}
        and deleted_at is null
      order by created_at desc
    `
    return rows.map(mapEndpoint)
  }

  if (input?.globalOnly) {
    const rows = await sql<EndpointRow[]>`
      select id, company_id, form_id, name, url, events, is_active, created_at, updated_at
      from public.integration_webhook_endpoints
      where company_id = ${companyId}
        and form_id is null
        and deleted_at is null
      order by created_at desc
    `
    return rows.map(mapEndpoint)
  }

  const rows = await sql<EndpointRow[]>`
    select id, company_id, form_id, name, url, events, is_active, created_at, updated_at
    from public.integration_webhook_endpoints
    where company_id = ${companyId}
      and deleted_at is null
    order by form_id nulls first, created_at desc
  `
  return rows.map(mapEndpoint)
}

export async function listDeliveries(input?: {
  companyId?: string | null
  limit?: number
  /** When set, only deliveries for webhooks of this form. */
  formId?: string | null
}): Promise<DeliveryRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, input?.companyId)
  if (input?.formId) {
    await requirePermission("forms.view", companyId)
  } else {
    await requirePermission("settings.manage_settings", companyId)
  }
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200)
  const sql = getSql()
  const formId = input?.formId ?? null

  const rows = formId
    ? await sql`
        select
          d.id, d.company_id, d.endpoint_id, d.event_type, d.event_key, d.payload,
          d.status, d.attempts, d.next_attempt_at, d.last_error, d.response_status,
          d.sent_at, d.created_at,
          e.name as endpoint_name
        from public.integration_delivery_outbox d
        left join public.integration_webhook_endpoints e on e.id = d.endpoint_id
        where d.company_id = ${companyId}
          and e.form_id = ${formId}
        order by d.created_at desc
        limit ${limit}
      `
    : await sql`
        select
          d.id, d.company_id, d.endpoint_id, d.event_type, d.event_key, d.payload,
          d.status, d.attempts, d.next_attempt_at, d.last_error, d.response_status,
          d.sent_at, d.created_at,
          e.name as endpoint_name
        from public.integration_delivery_outbox d
        left join public.integration_webhook_endpoints e on e.id = d.endpoint_id
        where d.company_id = ${companyId}
        order by d.created_at desc
        limit ${limit}
      `

  return rows.map((row) => ({
    id: row.id as string,
    companyId: row.company_id as string,
    endpointId: row.endpoint_id as string,
    endpointName: (row.endpoint_name as string | null) ?? null,
    eventType: row.event_type as string,
    eventKey: row.event_key as string,
    payload: parseJsonbObject(row.payload),
    status: row.status as DeliveryRow["status"],
    attempts: Number(row.attempts),
    nextAttemptAt: toIso(row.next_attempt_at as Date | string),
    lastError: (row.last_error as string | null) ?? null,
    responseStatus: row.response_status == null ? null : Number(row.response_status),
    sentAt: row.sent_at ? toIso(row.sent_at as Date | string) : null,
    createdAt: toIso(row.created_at as Date | string),
  }))
}
