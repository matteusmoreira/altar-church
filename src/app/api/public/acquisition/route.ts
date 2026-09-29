import { NextResponse } from "next/server"
import { getSql } from "@/lib/db/client"
import { recordPublicPageView } from "@/lib/public/acquisition"
import { consumePublicRateLimit } from "@/lib/security/public-rate-limit"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const slug = String(body.companySlug ?? "").trim().slice(0, 120)
    if (slug) {
      const companies = await getSql()<{ id: string }[]>`
        select id from public.companies where slug = ${slug} and active = true and status = 'active' limit 1
      `
      if (companies[0]) {
        const allowed = await consumePublicRateLimit({
          companyId: companies[0].id,
          scope: "acquisition",
          resourceId: companies[0].id,
          limit: 120,
        })
        if (!allowed) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })
      }
    }
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
