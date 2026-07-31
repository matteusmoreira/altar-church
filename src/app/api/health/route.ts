import { NextResponse } from "next/server"
import { getPublicHealthData } from "@/lib/operations/health"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await getPublicHealthData()
    return NextResponse.json(data, { status: data.status === "unavailable" ? 503 : 200 })
  } catch {
    return NextResponse.json(
      { status: "unavailable", checkedAt: new Date().toISOString(), checks: [] },
      { status: 503 },
    )
  }
}
