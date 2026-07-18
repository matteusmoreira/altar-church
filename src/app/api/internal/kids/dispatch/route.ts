import { NextResponse } from "next/server"
import { processKidDeliveryOutbox, reconcileKidWhatsApp } from "@/lib/kids/delivery"

/**
 * Worker Kids (cron): processa a outbox e reconcilia WhatsApp assíncrono.
 * Header: x-kids-worker-secret: $KIDS_WORKER_SECRET
 */
export async function POST(request: Request) {
  const expected = process.env.KIDS_WORKER_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Worker não configurado" } },
      { status: 500 },
    )
  }

  const provided =
    request.headers.get("x-kids-worker-secret") ??
    request.headers.get("X-Kids-Worker-Secret")

  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
      { status: 401 },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Number((body as { batchSize?: number }).batchSize ?? 25)
    const [reconcile, dispatch] = await Promise.all([
      reconcileKidWhatsApp(25),
      processKidDeliveryOutbox(Number.isFinite(batchSize) ? batchSize : 25),
    ])
    return NextResponse.json({ data: { reconcile, dispatch } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no dispatch"
    return NextResponse.json(
      { error: { code: "INTERNAL", message } },
      { status: 500 },
    )
  }
}
