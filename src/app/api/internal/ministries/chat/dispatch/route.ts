import { timingSafeEqual } from "node:crypto"
import { jsonError, jsonOk } from "@/lib/api/http"
import { unauthorized } from "@/lib/api/errors"
import { processMinistryChatPush } from "@/lib/ministries/chat-push"
import { getSql } from "@/lib/db/client"
export const maxDuration = 60
function requireWorker(request: Request) {
  const expected = process.env.INTEGRATION_WORKER_SECRET
  const provided = request.headers.get("x-integration-worker-secret")
  if (!expected || !provided) throw unauthorized()
  const a = Buffer.from(expected), b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw unauthorized()
}
export async function GET(request: Request) {
  try {
    requireWorker(request)
    const queue = await getSql()`select status,count(*)::int as total from public.ministry_chat_push_outbox group by status`
    return jsonOk({ dryRun: true, queue, pushConfigured: Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) })
  } catch (error) { return jsonError(error) }
}
export async function POST(request: Request) {
  try {
    requireWorker(request)
    return jsonOk(await processMinistryChatPush(25))
  } catch (error) { return jsonError(error) }
}
