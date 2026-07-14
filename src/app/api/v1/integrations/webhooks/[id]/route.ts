import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import {
  deleteWebhookEndpoint,
  saveWebhookEndpoint,
  testWebhookEndpoint,
} from "@/lib/integrations/webhooks"
import type { IntegrationEventType } from "@/lib/integrations/types"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const requestedCompanyId =
      typeof body.companyId === "string" ? body.companyId : request.nextUrl.searchParams.get("companyId")
    await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    const result = await saveWebhookEndpoint({
      id,
      companyId: requestedCompanyId,
      formId: body.formId != null ? String(body.formId) : null,
      name: String(body.name ?? ""),
      url: String(body.url ?? ""),
      events: (Array.isArray(body.events) ? body.events : []) as IntegrationEventType[],
      isActive: body.isActive != null ? Boolean(body.isActive) : true,
      rotateSecret: Boolean(body.rotateSecret),
    })

    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao atualizar webhook"))
    return jsonOk({ id: result.id, secret: result.secret })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    const result = await deleteWebhookEndpoint({ id, companyId: requestedCompanyId })
    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao remover"))
    return jsonOk({ id: result.id })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // POST /webhooks/:id with ?action=test
  try {
    const { id } = await context.params
    const action = request.nextUrl.searchParams.get("action")
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })

    if (action === "test") {
      const result = await testWebhookEndpoint({ id, companyId: requestedCompanyId })
      if (!result.ok) return jsonError(new Error(result.error ?? "Erro no teste"))
      return jsonOk(result.data ?? { ok: true })
    }

    return jsonError(new Error("Ação inválida"))
  } catch (error) {
    return jsonError(error)
  }
}
