import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteerFeedback } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) {
  try { return fromActionResult(await saveVolunteerFeedback({ ...(await parseJsonBody(request) as object), assignmentId: (await context.params).id } as Parameters<typeof saveVolunteerFeedback>[0])) }
  catch (error) { return jsonError(error) }
}

