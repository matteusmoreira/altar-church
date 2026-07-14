import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getContentDashboardData } from "@/lib/content/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "content.view")
    const data = await getContentDashboardData(companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
