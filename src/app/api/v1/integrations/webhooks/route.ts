import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getSql } from "@/lib/db/client"
import { assertSafeWebhookUrl, generateWebhookSecret } from "@/lib/integrations/crypto"
import { listWebhookEndpoints } from "@/lib/integrations/webhooks"
import { saveWebhookEndpoint } from "@/lib/integrations/webhooks-actions"
import type { IntegrationEventType } from "@/lib/integrations/types"
import { INTEGRATION_EVENTS } from "@/lib/integrations/types"

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const formId = request.nextUrl.searchParams.get("formId")?.trim() || null
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    if (auth.authType === "api_key") {
      const sql = getSql()
      const rows = formId
        ? await sql`
            select id, company_id, form_id, name, url, events, is_active, created_at, updated_at
            from public.integration_webhook_endpoints
            where company_id = ${auth.companyId}
              and form_id = ${formId}
              and deleted_at is null
            order by created_at desc
          `
        : await sql`
            select id, company_id, form_id, name, url, events, is_active, created_at, updated_at
            from public.integration_webhook_endpoints
            where company_id = ${auth.companyId}
              and deleted_at is null
            order by form_id nulls first, created_at desc
          `
      const data = rows.map((row) => ({
        id: row.id as string,
        companyId: row.company_id as string,
        formId: (row.form_id as string | null) ?? null,
        name: row.name as string,
        url: row.url as string,
        events: row.events as IntegrationEventType[],
        isActive: Boolean(row.is_active),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      }))
      return jsonOk(data)
    }

    const data = await listWebhookEndpoints({
      companyId: auth.companyId,
      formId,
      globalOnly: !formId && request.nextUrl.searchParams.get("globalOnly") === "1",
    })
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const requestedCompanyId =
      typeof body.companyId === "string" ? body.companyId : request.nextUrl.searchParams.get("companyId")
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    const name = String(body.name ?? "").trim()
    const url = String(body.url ?? "").trim()
    const events = (Array.isArray(body.events) ? body.events : []).filter((e): e is IntegrationEventType =>
      (INTEGRATION_EVENTS as readonly string[]).includes(String(e)),
    )
    const formId = body.formId != null && String(body.formId) ? String(body.formId) : null
    const isActive = body.isActive != null ? Boolean(body.isActive) : true

    if (!name || !url || events.length === 0) {
      return jsonError(new Error("name, url e events são obrigatórios"))
    }
    assertSafeWebhookUrl(url)

    if (auth.authType === "api_key") {
      const secret = generateWebhookSecret()
      const sql = getSql()
      const rows = await sql<{ id: string }[]>`
        insert into public.integration_webhook_endpoints (
          company_id, form_id, name, url, secret, events, is_active
        )
        values (
          ${auth.companyId}, ${formId}, ${name}, ${url}, ${secret}, ${events}, ${isActive}
        )
        returning id
      `
      return jsonOk({ id: rows[0]?.id, secret }, { status: 201 })
    }

    const result = await saveWebhookEndpoint({
      companyId: auth.companyId,
      formId,
      name,
      url,
      events,
      isActive,
    })

    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao criar webhook"))
    return jsonOk({ id: result.id, secret: result.secret }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
