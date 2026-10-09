import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getMemberMinistryDetails } from "@/lib/member/ministry-details"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireApiAuth(request, { sessionOnly: true }); return jsonOk(await getMemberMinistryDetails((await context.params).id, new URL(request.url).searchParams.get("cursor"))) }
  catch (error) { return jsonError(error) }
}
