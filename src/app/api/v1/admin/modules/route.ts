import { requireApiSuperadmin } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getAdminModules } from "@/lib/admin/data"

export async function GET() {
  try {
    await requireApiSuperadmin()
    const data = await getAdminModules()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
