import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { createVolunteerCheckinQr } from "@/lib/volunteers/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const result = await createVolunteerCheckinQr(id)
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
