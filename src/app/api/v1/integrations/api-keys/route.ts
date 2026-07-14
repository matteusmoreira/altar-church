import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { createApiKey, listApiKeys } from "@/lib/integrations/api-keys"
import type { ApiKeyScope } from "@/lib/integrations/types"

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    // Session only — keys never manage keys
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      permission: "settings.manage_settings",
      sessionOnly: true,
    })
    const data = await listApiKeys(auth.companyId)
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
    await requireApiAuth(request, {
      requestedCompanyId,
      permission: "settings.manage_settings",
      sessionOnly: true,
    })

    const result = await createApiKey({
      companyId: requestedCompanyId,
      name: String(body.name ?? ""),
      scopes: (Array.isArray(body.scopes) ? body.scopes : []) as ApiKeyScope[],
      expiresAt: body.expiresAt != null ? String(body.expiresAt) : null,
    })

    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao criar chave"))
    return jsonOk({ id: result.id, secret: result.secret }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
