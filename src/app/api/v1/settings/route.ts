import { requireApiUser } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getSettingsData } from "@/lib/settings/data"

export async function GET() {
  try {
    await requireApiUser()
    const data = await getSettingsData()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
