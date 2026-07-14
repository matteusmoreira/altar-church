import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "volunteers.view")
    const data = await getVolunteerDashboardData(companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
