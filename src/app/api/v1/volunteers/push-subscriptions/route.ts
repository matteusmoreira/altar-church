import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteerPushSubscription } from "@/lib/volunteers/v2-actions"
export async function POST(request: Request) {
  try { return fromActionResult(await saveVolunteerPushSubscription(await parseJsonBody(request) as Parameters<typeof saveVolunteerPushSubscription>[0]), { successStatus: 201 }) }
  catch (error) { return jsonError(error) }
}

