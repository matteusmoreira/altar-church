import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { checkOutVolunteerAssignment } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(_request: Request, context: Context) {
  try { return fromActionResult(await checkOutVolunteerAssignment((await context.params).id)) }
  catch (error) { return jsonError(error) }
}

