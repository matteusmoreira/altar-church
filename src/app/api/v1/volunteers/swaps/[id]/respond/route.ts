import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { acceptVolunteerSwap } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) {
  try { const body = await parseJsonBody(request) as { accept?: boolean }; return fromActionResult(await acceptVolunteerSwap((await context.params).id, body.accept !== false)) }
  catch (error) { return jsonError(error) }
}

