import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { listMyInbox, markMyInboxRead } from "@/lib/notifications/inbox"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try { await requireApiAuth(request, { sessionOnly: true }); return jsonOk(await listMyInbox(Object.fromEntries(new URL(request.url).searchParams))) }
  catch (error) { return jsonError(error) }
}
export async function POST(request: Request) {
  try { await requireApiAuth(request, { sessionOnly: true }); return jsonOk(await markMyInboxRead(await parseJsonBody(request))) }
  catch (error) { return jsonError(error) }
}
