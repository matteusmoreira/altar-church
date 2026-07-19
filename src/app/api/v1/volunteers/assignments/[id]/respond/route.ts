import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { respondVolunteerAssignment } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) {
  try { return fromActionResult(await respondVolunteerAssignment({ ...(await parseJsonBody(request) as object), assignmentId: (await context.params).id } as Parameters<typeof respondVolunteerAssignment>[0])) }
  catch (error) { return jsonError(error) }
}

