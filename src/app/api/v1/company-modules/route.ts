import type { NextRequest } from "next/server"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireApiUser } from "@/lib/api/auth"
import { badRequest, forbidden } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser()
    const companyId = request.nextUrl.searchParams.get("companyId")?.trim()
    if (!companyId) {
      throw badRequest("companyId obrigatório")
    }
    if (user.role !== "superadmin" && user.churchId !== companyId) {
      throw forbidden()
    }
    const moduleIds = await getCompanyEnabledModuleIds(companyId)
    return jsonOk({ moduleIds })
  } catch (error) {
    return jsonError(error)
  }
}
