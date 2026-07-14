import { fromActionResult } from "@/lib/api/action"
import { requireApiSuperadmin } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveCompany } from "@/lib/admin/actions"
import { getAdminCompanies } from "@/lib/admin/data"

export async function GET() {
  try {
    await requireApiSuperadmin()
    const data = await getAdminCompanies()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSuperadmin()
    const body = await parseJsonBody(request)
    const result = await saveCompany(body as Parameters<typeof saveCompany>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
