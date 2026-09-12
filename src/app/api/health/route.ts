import { NextResponse } from "next/server"
import { getPublicLivenessData } from "@/lib/operations/health"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(getPublicLivenessData(), { status: 200 })
  } catch {
    return NextResponse.json(
      { status: "unavailable", checkedAt: new Date().toISOString(), checks: [] },
      { status: 503 },
    )
  }
}
