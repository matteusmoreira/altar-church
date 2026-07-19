import { fromActionResult } from "@/lib/api/action"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getVolunteerPortalData } from "@/lib/volunteers/data"
import { saveMyVolunteerNotificationPreferences } from "@/lib/volunteers/v2-actions"
export async function GET() {
  try { return jsonOk((await getVolunteerPortalData()).notificationPreferences) }
  catch (error) { return jsonError(error) }
}
export async function PUT(request: Request) {
  try { return fromActionResult(await saveMyVolunteerNotificationPreferences(await parseJsonBody(request) as Parameters<typeof saveMyVolunteerNotificationPreferences>[0])) }
  catch (error) { return jsonError(error) }
}

