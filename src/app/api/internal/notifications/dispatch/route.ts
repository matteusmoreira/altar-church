import { NextResponse } from "next/server"
import { processNotificationOutbox } from "@/lib/notifications/delivery"
import { getSql } from "@/lib/db/client"

export const dynamic = "force-dynamic"

function authorizationError(request: Request) {
  const expected = process.env.NOTIFICATION_WORKER_SECRET || process.env.INTEGRATION_WORKER_SECRET
  const provided = request.headers.get("x-notification-worker-secret")
  if (!expected) {
    return NextResponse.json({ error: { code: "INTERNAL", message: "Worker de notificações não configurado" } }, { status: 500 })
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Não autorizado" } }, { status: 401 })
  }
  return null
}

async function diagnostic() {
  const rows = await getSql()`select channel, status, count(*)::int as count from public.notification_deliveries group by channel, status`
  return NextResponse.json({ data: { dryRun: true, queue: rows, pushConfigured: Boolean(process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) } })
}

export async function GET(request: Request) {
  const denied = authorizationError(request)
  if (denied) return denied
  try { return await diagnostic() }
  catch { return NextResponse.json({ error: { code: "INTERNAL", message: "Não foi possível consultar a fila" } }, { status: 500 }) }
}

export async function POST(request: Request) {
  const denied = authorizationError(request)
  if (denied) return denied

  try {
    const body = await request.json().catch(() => ({})) as { batchSize?: number; dryRun?: boolean }
    if (body.dryRun === true) {
      return await diagnostic()
    }
    const batchSize = Number(body.batchSize ?? 25)
    const safeBatchSize = Number.isFinite(batchSize) ? Math.min(Math.max(batchSize, 1), 100) : 25
    return NextResponse.json({ data: await processNotificationOutbox(safeBatchSize) })
  } catch (error) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: error instanceof Error ? error.message : "Erro no dispatch" } },
      { status: 500 },
    )
  }
}
