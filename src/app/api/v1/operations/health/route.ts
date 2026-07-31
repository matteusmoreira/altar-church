import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getOperationalHealthData } from "@/lib/operations/health"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "webhooks:manage",
      permission: "settings.manage_settings",
    })
    return jsonOk(await getOperationalHealthData(auth.companyId))
  } catch (error) {
    return jsonError(error)
  }
}
