"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { assertSafeWebhookUrl, generateWebhookSecret } from "./crypto"
import { processIntegrationOutbox, retryDelivery } from "./deliver"
import { enqueueIntegrationEvent } from "./enqueue"
import {
  INTEGRATION_EVENTS,
  type IntegrationsActionResult,
  type IntegrationEventType,
} from "./types"

const nullableUuid = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
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

    await sql`
      update public.integration_webhook_endpoints
      set events = case
        when not ('integration.test' = any(events)) then array_append(events, 'integration.test')
        else events
      end
      where id = ${id}
    `

    // Payload no formato form.submitted (com person.phone) para destinos como Altar Chat
    // aceitarem o botão "Testar". O event type continua integration.test (só para log/UI).
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
        submissionId: null,
        form: {
          id: endpoints[0].form_id,
          title: "Teste de webhook",
          slug: "integration-test",
        },
        person: {
          id: null,
          name: "Lead Teste",
          email: "teste@example.com",
          phone: "+5511999990000",
        },
        fields: {
          nome: "Lead Teste",
          telefone: "+5511999990000",
        },
        source: "Teste de webhook (Altar Church)",
      },
    })

    if (enqueued === 0) {
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
