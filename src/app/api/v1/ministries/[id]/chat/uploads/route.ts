import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { requireApiAuth } from "@/lib/api/auth"
import { prepareChatUpload, finalizeChatUpload } from "@/lib/ministries/chat-server"
import { z } from "zod"
type Context = { params: Promise<{ id: string }> }
export async function POST(request: Request, context: Context) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    return jsonOk(await prepareChatUpload((await context.params).id, await parseJsonBody(request)), { status: 201 })
  } catch (error) { return jsonError(error) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    const data = z.object({ id: z.string().uuid() }).parse(await parseJsonBody(request))
    return jsonOk(await finalizeChatUpload((await context.params).id, data.id))
  } catch (error) { return jsonError(error) }
}
