import { NextResponse } from "next/server"
import { processNotificationOutbox } from "@/lib/notifications/delivery"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const expected = process.env.NOTIFICATION_WORKER_SECRET
  const provided = request.headers.get("x-notification-worker-secret")
  if (!expected) {
    return NextResponse.json({ error: { code: "INTERNAL", message: "Worker de notificações não configurado" } }, { status: 500 })
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Não autorizado" } }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({})) as { batchSize?: number }
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
