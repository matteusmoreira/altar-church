import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteer } from "@/lib/volunteers/actions"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveVolunteer(body as Parameters<typeof saveVolunteer>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
