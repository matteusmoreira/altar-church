import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { retryIntegrationDelivery } from "@/lib/integrations/webhooks"

export async function POST(
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

    const result = await retryIntegrationDelivery({ id, companyId: requestedCompanyId })
    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao reenviar"))
    return jsonOk({ id: result.id })
  } catch (error) {
    return jsonError(error)
  }
}
