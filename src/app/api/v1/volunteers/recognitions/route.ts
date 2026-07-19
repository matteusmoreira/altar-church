import { fromActionResult } from "@/lib/api/action"
import { requireApiUser } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getVolunteerPortalData } from "@/lib/volunteers/data"
import { grantVolunteerRecognition } from "@/lib/volunteers/v2-actions"
export async function GET() {
  try { await requireApiUser(); return jsonOk((await getVolunteerPortalData()).recognitions) }
  catch (error) { return jsonError(error) }
}
export async function POST(request: Request) {
  try { return fromActionResult(await grantVolunteerRecognition(await parseJsonBody(request) as Parameters<typeof grantVolunteerRecognition>[0]), { successStatus: 201 }) }
  catch (error) { return jsonError(error) }
}

