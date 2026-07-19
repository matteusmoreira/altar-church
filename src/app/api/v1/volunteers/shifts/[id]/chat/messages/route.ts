import { fromActionResult } from "@/lib/api/action"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { sendVolunteerShiftMessage } from "@/lib/volunteers/v2-actions"
import { listVolunteerShiftMessages } from "@/lib/volunteers/v2-data"
type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
  try { return jsonOk(await listVolunteerShiftMessages((await context.params).id)) }
  catch (error) { return jsonError(error) }
}
export async function POST(request: Request, context: Context) {
  try { return fromActionResult(await sendVolunteerShiftMessage({ ...(await parseJsonBody(request) as object), shiftId: (await context.params).id } as Parameters<typeof sendVolunteerShiftMessage>[0]), { successStatus: 201 }) }
  catch (error) { return jsonError(error) }
}

