import { requireApiUser } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"

export async function GET() {
  try {
    const user = await requireApiUser()
    return jsonOk({ user })
  } catch (error) {
    return jsonError(error)
  }
}
