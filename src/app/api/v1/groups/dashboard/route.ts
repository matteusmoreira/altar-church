import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getGroupsDashboardData } from "@/lib/groups/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "groups.view")
    const data = await getGroupsDashboardData(companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
