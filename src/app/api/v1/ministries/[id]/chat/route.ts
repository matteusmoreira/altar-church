import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { requireApiAuth } from "@/lib/api/auth"
import { listMinistryChat, sendMinistryChat, commandMinistryChat } from "@/lib/ministries/chat-server"
type Context = { params: Promise<{ id: string }> }
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: Context) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    const query = new URL(request.url).searchParams
    return jsonOk(await listMinistryChat((await context.params).id, query.get("before"), query.get("ids")))
  } catch (error) { return jsonError(error) }
}
export async function POST(request: Request, context: Context) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    return jsonOk(await sendMinistryChat((await context.params).id, await parseJsonBody(request)), { status: 201 })
  } catch (error) { return jsonError(error) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    return jsonOk(await commandMinistryChat((await context.params).id, await parseJsonBody(request)))
  } catch (error) { return jsonError(error) }
}
