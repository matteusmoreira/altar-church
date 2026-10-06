import { jsonError } from "@/lib/api/http"
import { requireApiAuth } from "@/lib/api/auth"
import { downloadChatFile } from "@/lib/ministries/chat-server"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    await requireApiAuth(request, { sessionOnly: true })
    const { id, fileId } = await context.params
    return await downloadChatFile(id, fileId, request.headers.get("range"))
  } catch (error) { return jsonError(error) }
}
