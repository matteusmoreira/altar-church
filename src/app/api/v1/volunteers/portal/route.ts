import { requireApiUser } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getVolunteerPortalData } from "@/lib/volunteers/data"

export async function GET() {
  try {
    await requireApiUser()
    const data = await getVolunteerPortalData()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
