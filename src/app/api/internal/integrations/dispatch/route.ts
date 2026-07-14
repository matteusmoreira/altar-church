import { NextResponse } from "next/server"
import { processIntegrationOutbox } from "@/lib/integrations/deliver"

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
    const result = await processIntegrationOutbox(
      Number.isFinite(batchSize) ? batchSize : 25,
    )
    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no dispatch"
    return NextResponse.json(
      { error: { code: "INTERNAL", message } },
      { status: 500 },
    )
  }
}
