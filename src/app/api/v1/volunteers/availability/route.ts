import { fromActionResult } from "@/lib/api/action"
import { requireApiUser } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getVolunteerPortalData } from "@/lib/volunteers/data"
import { saveMyVolunteerAvailability } from "@/lib/volunteers/v2-actions"
export async function GET() {
  try { await requireApiUser(); return jsonOk((await getVolunteerPortalData()).availability) }
  catch (error) { return jsonError(error) }
}
export async function PUT(request: Request) {
  try { return fromActionResult(await saveMyVolunteerAvailability(await parseJsonBody(request) as Parameters<typeof saveMyVolunteerAvailability>[0])) }
  catch (error) { return jsonError(error) }
}

