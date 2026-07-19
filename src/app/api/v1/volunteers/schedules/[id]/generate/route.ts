import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { generateSmartVolunteerSchedule } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function POST(_request: Request, context: Context) {
  try { return fromActionResult(await generateSmartVolunteerSchedule((await context.params).id)) }
  catch (error) { return jsonError(error) }
}

