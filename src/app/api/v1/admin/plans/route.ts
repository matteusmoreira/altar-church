import { fromActionResult } from "@/lib/api/action"
import { requireApiSuperadmin } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { savePlan } from "@/lib/admin/actions"
import { getAdminPlans } from "@/lib/admin/data"

export async function GET() {
  try {
    await requireApiSuperadmin()
    const data = await getAdminPlans()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSuperadmin()
    const body = await parseJsonBody(request)
    const result = await savePlan(body as Parameters<typeof savePlan>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
