import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"

const sourceKinds = new Set(["qr", "instagram", "site", "referral", "event", "campaign", "direct", "other"])

function bounded(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export function normalizePublicSource(value: unknown) {
  const source = bounded(value, 40).toLowerCase()
  if (sourceKinds.has(source)) return source
  if (source.includes("instagram")) return "instagram"
  if (source.includes("indic") || source.includes("ref")) return "referral"
  if (source.includes("evento") || source.includes("event")) return "event"
  if (source.includes("camp")) return "campaign"
  return source ? "other" : "direct"
}

export type PublicAcquisitionInput = {
  companySlug: string
  source?: string
  sourceLabel?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  landingPath?: string
  referrer?: string
  sessionKey?: string
}

export async function recordPublicPageView(input: PublicAcquisitionInput) {
  const sql = getSql()
  const companies = await sql<{ id: string }[]>`
    select id from public.companies
    where slug = ${bounded(input.companySlug, 120)} and active = true and status = 'active'
    limit 1
  `
  const company = companies[0]
  if (!company) return { ok: false as const }

  const sessionKey = bounded(input.sessionKey, 120)
  const path = bounded(input.landingPath, 500)
  const idempotencyKey = sessionKey ? `page_view:${sessionKey}:${path}` : null
  await sql`
    insert into public.public_acquisition_events (
      company_id, event_kind, source_kind, source_label,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      landing_path, referrer, session_key, idempotency_key
    )
    values (
      ${company.id}, 'page_view', ${normalizePublicSource(input.source || input.utmSource)},
      ${bounded(input.sourceLabel, 120)}, ${bounded(input.utmSource, 120)}, ${bounded(input.utmMedium, 120)},
      ${bounded(input.utmCampaign, 160)}, ${bounded(input.utmContent, 160)}, ${bounded(input.utmTerm, 160)},
      ${path}, ${bounded(input.referrer, 500)}, ${sessionKey}, ${idempotencyKey}
    )
    on conflict do nothing
  `
  return { ok: true as const }
}

export async function listPublicAcquisitionMetrics(companyIdInput?: string | null, days = 30) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  await requirePermission("reports.view", companyId)
  const safeDays = Math.min(Math.max(Math.trunc(days), 1), 365)
  const sql = getSql()
  const [summary, bySource, daily] = await Promise.all([
    sql<{ event_kind: string; total: number; unique_people: number }[]>`
      select event_kind, count(*)::int as total, count(distinct person_id)::int as unique_people
      from public.public_acquisition_events
      where company_id = ${companyId} and created_at >= now() - (${safeDays} || ' days')::interval
      group by event_kind order by event_kind
    `,
    sql<{ source_kind: string; page_views: number; submissions: number; conversions: number }[]>`
      select source_kind,
        count(*) filter (where event_kind = 'page_view')::int as page_views,
        count(*) filter (where event_kind = 'form_submission')::int as submissions,
        count(*) filter (where event_kind = 'conversion')::int as conversions
      from public.public_acquisition_events
      where company_id = ${companyId} and created_at >= now() - (${safeDays} || ' days')::interval
      group by source_kind order by (count(*) filter (where event_kind = 'form_submission')) desc, source_kind
    `,
    sql<{ day: string; page_views: number; submissions: number }[]>`
      select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day,
        count(*) filter (where event_kind = 'page_view')::int as page_views,
        count(*) filter (where event_kind = 'form_submission')::int as submissions
      from public.public_acquisition_events
      where company_id = ${companyId} and created_at >= now() - (${safeDays} || ' days')::interval
      group by 1 order by 1 desc limit 120
    `,
  ])
  return { days: safeDays, summary, bySource, daily }
}
