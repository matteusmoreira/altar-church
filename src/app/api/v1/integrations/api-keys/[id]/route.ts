import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { revokeApiKey } from "@/lib/integrations/api-keys-actions"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    await requireApiAuth(request, {
      requestedCompanyId,
      permission: "settings.manage_settings",
      sessionOnly: true,
    })

    const result = await revokeApiKey({ id, companyId: requestedCompanyId })
    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao revogar"))
    return jsonOk({ id: result.id })
  } catch (error) {
    return jsonError(error)
  }
}
