import { jsonError, jsonOk } from "@/lib/api/http"
import { requireApiAuth } from "@/lib/api/auth"
import { listMinistryChats } from "@/lib/ministries/chat-server"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  try { await requireApiAuth(request, { sessionOnly: true }); return jsonOk(await listMinistryChats()) }
  catch (error) { return jsonError(error) }
}
