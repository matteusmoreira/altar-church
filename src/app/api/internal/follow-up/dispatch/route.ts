import { NextResponse } from "next/server"
import { processFollowUpTriggers } from "@/lib/people/follow-up"

export async function POST(request: Request) {
  const configured = process.env.FOLLOW_UP_WORKER_SECRET ?? ""
  const supplied = request.headers.get("x-follow-up-worker-secret") ?? ""
  if (!configured || supplied !== configured) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 })
  }
  try {
    const body = await request.json().catch(() => ({})) as { batchSize?: number }
    const batchSize = Math.max(1, Math.min(Number(body.batchSize) || 25, 100))
    return NextResponse.json({ ok: true, ...(await processFollowUpTriggers(undefined, batchSize)) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha no worker" }, { status: 500 })
  }
}
