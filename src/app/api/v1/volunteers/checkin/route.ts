import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { checkInVolunteerAssignment } from "@/lib/volunteers/actions"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await checkInVolunteerAssignment(
      body as Parameters<typeof checkInVolunteerAssignment>[0],
    )
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
