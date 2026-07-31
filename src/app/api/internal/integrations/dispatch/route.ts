import { NextResponse } from "next/server"
import { processIntegrationOutbox } from "@/lib/integrations/deliver"
import { processKidDeliveryOutbox, reconcileKidWhatsApp } from "@/lib/kids/delivery"
import { processNotificationOutbox } from "@/lib/notifications/delivery"
import { processFollowUpTriggers } from "@/lib/people/follow-up"
import { processVolunteerChatPushOutbox } from "@/lib/volunteers/chat-delivery"

/**
 * Cron / worker entrypoint.
 * Header: x-integration-worker-secret: $INTEGRATION_WORKER_SECRET
 */
export async function POST(request: Request) {
  const expected = process.env.INTEGRATION_WORKER_SECRET
  if (!expected) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Worker não configurado" } },
      { status: 500 },
    )
  }

  const provided =
    request.headers.get("x-integration-worker-secret") ??
    request.headers.get("X-Integration-Worker-Secret")

  if (!provided || provided !== expected) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Não autorizado" } },
      { status: 401 },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Number((body as { batchSize?: number }).batchSize ?? 25)
    const safeBatchSize = Number.isFinite(batchSize) ? Math.min(Math.max(batchSize, 1), 100) : 25
    const [integrations, kidsReconcile, kidsDispatch, volunteerChat, notifications, followUp] = await Promise.all([
      processIntegrationOutbox(safeBatchSize),
      reconcileKidWhatsApp(safeBatchSize),
      processKidDeliveryOutbox(safeBatchSize),
      processVolunteerChatPushOutbox(safeBatchSize),
      processNotificationOutbox(safeBatchSize),
      processFollowUpTriggers(undefined, safeBatchSize),
    ])
    return NextResponse.json({ data: { integrations, kids: { reconcile: kidsReconcile, dispatch: kidsDispatch }, volunteerChat, notifications, followUp } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no dispatch"
    return NextResponse.json(
      { error: { code: "INTERNAL", message } },
      { status: 500 },
    )
  }
}
