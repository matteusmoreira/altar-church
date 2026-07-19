import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteerDepartment } from "@/lib/volunteers/actions"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "volunteers.view")
    return jsonOk((await getVolunteerDashboardData(companyId)).departments)
  } catch (error) { return jsonError(error) }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveVolunteerDepartment(body as Parameters<typeof saveVolunteerDepartment>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
