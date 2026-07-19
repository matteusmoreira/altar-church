import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { reviewVolunteerSwap } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) {
  try { const body = await parseJsonBody(request) as { approve?: boolean }; return fromActionResult(await reviewVolunteerSwap((await context.params).id, body.approve === true)) }
  catch (error) { return jsonError(error) }
}

