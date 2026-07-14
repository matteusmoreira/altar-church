import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { markVolunteerFeedRead } from "@/lib/volunteers/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const result = await markVolunteerFeedRead(id)
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
