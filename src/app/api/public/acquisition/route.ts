import { NextResponse } from "next/server"
import { recordPublicPageView } from "@/lib/public/acquisition"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const result = await recordPublicPageView({
      companySlug: String(body.companySlug ?? ""),
      source: String(body.source ?? ""),
      sourceLabel: String(body.sourceLabel ?? ""),
      utmSource: String(body.utmSource ?? ""),
      utmMedium: String(body.utmMedium ?? ""),
      utmCampaign: String(body.utmCampaign ?? ""),
      utmContent: String(body.utmContent ?? ""),
      utmTerm: String(body.utmTerm ?? ""),
      landingPath: String(body.landingPath ?? ""),
      referrer: String(body.referrer ?? ""),
      sessionKey: String(body.sessionKey ?? ""),
    })
    return NextResponse.json(result, { status: result.ok ? 201 : 404 })
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}
