import { NextResponse } from "next/server"
import { getPublicHealthData } from "@/lib/operations/health"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await getPublicHealthData()
    const ready = data.status === "healthy"
    return NextResponse.json(
      { status: ready ? "ready" : "not_ready", checkedAt: data.checkedAt, checks: data.checks },
      { status: ready ? 200 : 503 },
    )
  } catch {
    return NextResponse.json(
      { status: "not_ready", checkedAt: new Date().toISOString(), checks: [] },
      { status: 503 },
    )
  }
}
