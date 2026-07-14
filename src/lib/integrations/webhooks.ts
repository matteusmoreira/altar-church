"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { assertSafeWebhookUrl, generateWebhookSecret } from "./crypto"
import { processIntegrationOutbox } from "./deliver"
import { enqueueIntegrationEvent } from "./enqueue"
import { INTEGRATION_EVENTS, type DeliveryRow, type IntegrationsActionResult, type IntegrationEventType, type WebhookEndpoint } from "./types"

const nullableUuid = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v || null)

const eventSchema = z.enum(INTEGRATION_EVENTS as unknown as [IntegrationEventType, ...IntegrationEventType[]])

const saveSchema = z.object({
  id: nullableUuid,
  companyId: nullableUuid,
  formId: nullableUuid,
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  url: z.string().trim().url("URL inválida"),
  events: z.array(eventSchema).min(1, "Selecione ao menos um evento"),
  isActive: z.boolean().optional().default(true),
  rotateSecret: z.boolean().optional().default(false),
})

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
}): Promise<DeliveryRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, input?.companyId)
  await requirePermission("settings.manage_settings", companyId)
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200)
  const sql = getSql()
  const rows = await sql`
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
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as DeliveryRow["status"],
    attempts: Number(row.attempts),
    nextAttemptAt: toIso(row.next_attempt_at as Date | string),
    lastError: (row.last_error as string | null) ?? null,
    responseStatus: row.response_status == null ? null : Number(row.response_status),
    sentAt: row.sent_at ? toIso(row.sent_at as Date | string) : null,
    createdAt: toIso(row.created_at as Date | string),
  }))
}

export async function saveWebhookEndpoint(input: {
  id?: string | null
  companyId?: string | null
  formId?: string | null
  name: string
  url: string
  events: IntegrationEventType[]
  isActive?: boolean
  rotateSecret?: boolean
}): Promise<IntegrationsActionResult> {
  try {
    const parsed = saveSchema.parse(input)
    assertSafeWebhookUrl(parsed.url)

    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, parsed.companyId)

    if (parsed.formId) {
      await requirePermission("forms.edit", companyId)
    } else {
      await requirePermission("settings.manage_settings", companyId)
    }

    if (parsed.formId) {
      const sqlCheck = getSql()
      const forms = await sqlCheck<{ id: string }[]>`
        select id from public.forms
        where id = ${parsed.formId}
          and company_id = ${companyId}
          and deleted_at is null
        limit 1
      `
      if (!forms[0]) throw new Error("Formulário não encontrado")
    }

    const sql = getSql()
    let secret: string | undefined

    if (parsed.id) {
      if (parsed.rotateSecret) {
        secret = generateWebhookSecret()
        const rows = await sql<{ id: string }[]>`
          update public.integration_webhook_endpoints
          set name = ${parsed.name},
              url = ${parsed.url},
              events = ${parsed.events},
              is_active = ${parsed.isActive},
              secret = ${secret},
              form_id = ${parsed.formId},
              updated_by = ${user.id}
          where id = ${parsed.id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
        if (!rows[0]) throw new Error("Endpoint não encontrado")
      } else {
        const rows = await sql<{ id: string }[]>`
          update public.integration_webhook_endpoints
          set name = ${parsed.name},
              url = ${parsed.url},
              events = ${parsed.events},
              is_active = ${parsed.isActive},
              form_id = ${parsed.formId},
              updated_by = ${user.id}
          where id = ${parsed.id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
        if (!rows[0]) throw new Error("Endpoint não encontrado")
      }

      await writeAuditLog({
        action: "webhook_endpoint.save",
        entityTable: "integration_webhook_endpoints",
        entityId: parsed.id,
        companyId,
        metadata: { name: parsed.name, formId: parsed.formId, rotateSecret: parsed.rotateSecret },
      })
      revalidatePath("/configuracoes")
      if (parsed.formId) revalidatePath(`/formularios/${parsed.formId}`)
      return { ok: true, id: parsed.id, secret }
    }

    secret = generateWebhookSecret()
    const rows = await sql<{ id: string }[]>`
      insert into public.integration_webhook_endpoints (
        company_id, form_id, name, url, secret, events, is_active, created_by, updated_by
      )
      values (
        ${companyId},
        ${parsed.formId},
        ${parsed.name},
        ${parsed.url},
        ${secret},
        ${parsed.events},
        ${parsed.isActive},
        ${user.id},
        ${user.id}
      )
      returning id
    `
    const id = rows[0]?.id
    if (!id) throw new Error("Não foi possível criar o endpoint")

    await writeAuditLog({
      action: "webhook_endpoint.create",
      entityTable: "integration_webhook_endpoints",
      entityId: id,
      companyId,
      metadata: { name: parsed.name, formId: parsed.formId, events: parsed.events },
    })
    revalidatePath("/configuracoes")
    if (parsed.formId) revalidatePath(`/formularios/${parsed.formId}`)
    return { ok: true, id, secret }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao salvar webhook",
    }
  }
}

export async function deleteWebhookEndpoint(input: {
  id: string
  companyId?: string | null
}): Promise<IntegrationsActionResult> {
  try {
    const id = z.string().uuid().parse(input.id)
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, input.companyId)

    const sql = getSql()
    const existing = await sql<{ id: string; form_id: string | null }[]>`
      select id, form_id
      from public.integration_webhook_endpoints
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!existing[0]) throw new Error("Endpoint não encontrado")

    if (existing[0].form_id) {
      await requirePermission("forms.edit", companyId)
    } else {
      await requirePermission("settings.manage_settings", companyId)
    }

    const rows = await sql<{ id: string; form_id: string | null }[]>`
      update public.integration_webhook_endpoints
      set deleted_at = now(), updated_by = ${user.id}, is_active = false
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id, form_id
    `
    if (!rows[0]) throw new Error("Endpoint não encontrado")

    await writeAuditLog({
      action: "webhook_endpoint.delete",
      entityTable: "integration_webhook_endpoints",
      entityId: id,
      companyId,
    })
    revalidatePath("/configuracoes")
    if (rows[0].form_id) revalidatePath(`/formularios/${rows[0].form_id}`)
    return { ok: true, id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao remover webhook",
    }
  }
}

export async function testWebhookEndpoint(input: {
  id: string
  companyId?: string | null
}): Promise<IntegrationsActionResult> {
  try {
    const id = z.string().uuid().parse(input.id)
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, input.companyId)

    const sql = getSql()
    const endpoints = await sql<{ id: string; form_id: string | null }[]>`
      select id, form_id from public.integration_webhook_endpoints
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!endpoints[0]) throw new Error("Endpoint não encontrado")
    if (endpoints[0].form_id) {
      await requirePermission("forms.edit", companyId)
    } else {
      await requirePermission("settings.manage_settings", companyId)
    }

    const companyRows = await sql<{ slug: string; name: string }[]>`
      select slug, name from public.companies where id = ${companyId} limit 1
    `

    // Temporarily ensure endpoint listens to integration.test by enqueueing with direct insert
    await sql`
      update public.integration_webhook_endpoints
      set events = case
        when not ('integration.test' = any(events)) then array_append(events, 'integration.test')
        else events
      end
      where id = ${id}
    `

    const eventKey = `integration.test:${id}:${Date.now()}`
    const { enqueued } = await enqueueIntegrationEvent({
      companyId,
      companySlug: companyRows[0]?.slug,
      companyName: companyRows[0]?.name,
      formId: endpoints[0].form_id,
      eventType: "integration.test",
      eventKey,
      data: {
        message: "Teste de webhook do Altar Church",
        triggeredBy: user.id,
      },
    })

    if (enqueued === 0) {
      // Endpoint might be form-scoped; try again without form filter via direct outbox for this endpoint only
      throw new Error("Não foi possível enfileirar o teste")
    }

    const result = await processIntegrationOutbox(10)
    await writeAuditLog({
      action: "webhook_endpoint.test",
      entityTable: "integration_webhook_endpoints",
      entityId: id,
      companyId,
      metadata: result,
    })

    return { ok: true, id, data: result }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro no teste",
    }
  }
}

export async function retryIntegrationDelivery(input: {
  id: string
  companyId?: string | null
}): Promise<IntegrationsActionResult> {
  try {
    const id = z.string().uuid().parse(input.id)
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, input.companyId)
    await requirePermission("settings.manage_settings", companyId)

    const { retryDelivery } = await import("./deliver")
    const retried = await retryDelivery(id, companyId)
    if (!retried) throw new Error("Entrega não encontrada")

    void processIntegrationOutbox(5)
    revalidatePath("/configuracoes")
    return { ok: true, id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao reenviar",
    }
  }
}
