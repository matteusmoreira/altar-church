import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const { formatAge, healthLabel, overallHealthStatus } = await import("../src/lib/operations/health-core.ts")

test("health core selects worst status without hiding provider gaps", () => {
  assert.equal(overallHealthStatus([{ key: "db", label: "DB", status: "healthy", detail: "ok" }]), "healthy")
  assert.equal(overallHealthStatus([
    { key: "db", label: "DB", status: "healthy", detail: "ok" },
    { key: "backup", label: "Backup", status: "unknown", detail: "missing" },
  ]), "unknown")
  assert.equal(overallHealthStatus([
    { key: "db", label: "DB", status: "healthy", detail: "ok" },
    { key: "worker", label: "Worker", status: "unavailable", detail: "down" },
  ]), "unavailable")
})

test("health core formats stale timestamps", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z")
  assert.equal(formatAge("2026-07-31T11:30:00.000Z", now), "30 min atrás")
  assert.equal(formatAge("2026-07-29T12:00:00.000Z", now), "2 d atrás")
  assert.equal(formatAge(null, now), "Não informado")
  assert.equal(healthLabel("not_configured"), "Não configurado")
})

test("operational release surfaces exist and stay protected", () => {
  const health = fs.readFileSync("src/lib/operations/health.ts", "utf8")
  const api = fs.readFileSync("src/app/api/v1/operations/health/route.ts", "utf8")
  const page = fs.readFileSync("src/app/(dashboard)/configuracoes/operacao/page.tsx", "utf8")
  assert.match(health, /cron\.job_run_details/)
  assert.match(health, /integration_delivery_outbox/)
  assert.match(health, /volunteer_delivery_outbox/)
  assert.match(health, /kid_delivery_outbox/)
  assert.match(health, /person_follow_up_tasks/)
  assert.match(api, /requireApiAuth/)
  assert.match(api, /settings\.manage_settings/)
  assert.match(page, /Saúde operacional/)
})

test("Pessoa 360 keeps timeline, audited tasks, trigger dedupe and CRM reuse", () => {
  const migration = fs.readFileSync("supabase/migrations/20260731150000_person_360_follow_up.sql", "utf8")
  const timeline = fs.readFileSync("src/lib/people/follow-up.ts", "utf8")
  const actions = fs.readFileSync("src/lib/people/follow-up-actions.ts", "utf8")
  const detail = fs.readFileSync("src/app/(dashboard)/pessoas/[id]/follow-up-panel.tsx", "utf8")
  const worker = fs.readFileSync("src/app/api/internal/integrations/dispatch/route.ts", "utf8")
  assert.match(migration, /person_follow_up_tasks/)
  assert.match(migration, /person_follow_up_triggers/)
  assert.match(migration, /source_key/)
  assert.match(timeline, /notification_deliveries/)
  assert.match(timeline, /person_follow_up_tasks/)
  assert.match(timeline, /onflict do nothing/i)
  assert.match(actions, /crm_card_id/)
  assert.match(actions, /person_follow_up_task\.create/)
  assert.match(detail, /Linha do tempo/)
  assert.match(worker, /processFollowUpTriggers/)
})

test("cell health and member portal keep scoped metrics, RSVP race safety and self-service", () => {
  const cellMigration = fs.readFileSync("supabase/migrations/20260731190000_cell_health.sql", "utf8")
  const portalMigration = fs.readFileSync("supabase/migrations/20260731170000_member_portal_2.sql", "utf8")
  const health = fs.readFileSync("src/lib/cells/health.ts", "utf8")
  const portalActions = fs.readFileSync("src/lib/member/portal-actions.ts", "utf8")
  const agenda = fs.readFileSync("src/lib/member/data.ts", "utf8")
  assert.match(cellMigration, /cell_health_settings/)
  assert.match(cellMigration, /enable row level security/)
  assert.match(health, /cells\.view/)
  assert.match(health, /pending_reports30/)
  assert.match(portalMigration, /member_event_rsvps/)
  assert.match(portalActions, /for update/)
  assert.match(portalActions, /waitlisted/)
  assert.match(portalActions, /member\.profile\.update/)
  assert.match(agenda, /member_event_rsvps/)
})

test("notification campaigns keep tenant snapshot, opt-out and retry contracts", () => {
  const migration = fs.readFileSync("supabase/migrations/20260731130000_notification_campaign_delivery.sql", "utf8")
  const delivery = fs.readFileSync("src/lib/notifications/delivery.ts", "utf8")
  const campaign = fs.readFileSync("src/lib/notifications/campaign.ts", "utf8")
  const preferenceApi = fs.readFileSync("src/app/api/v1/notifications/preferences/route.ts", "utf8")
  assert.match(migration, /FOR UPDATE SKIP LOCKED/i)
  assert.match(migration, /notification_deliveries/)
  assert.match(migration, /notification_channel_preferences/)
  assert.match(migration, /company_id/)
  assert.match(delivery, /Idempotency-Key/)
  assert.match(delivery, /processNotificationOutbox/)
  assert.match(delivery, /is_active = false/)
  assert.match(campaign, /audience: NotificationAudience/)
  assert.match(campaign, /opted_out = true/)
  assert.match(preferenceApi, /sessionOnly: true/)
})

test("public acquisition keeps source attribution, event calendar and automatic form follow-up", () => {
  const migration = fs.readFileSync("supabase/migrations/20260731210000_public_acquisition.sql", "utf8")
  const publicData = fs.readFileSync("src/lib/content/data.ts", "utf8")
  const publicPage = fs.readFileSync("src/app/(public)/church/[slug]/page.tsx", "utf8")
  const formActions = fs.readFileSync("src/lib/forms/actions.ts", "utf8")
  const beacon = fs.readFileSync("src/components/public/acquisition-beacon.tsx", "utf8")
  const metrics = fs.readFileSync("src/lib/public/acquisition.ts", "utf8")
  assert.match(migration, /public_acquisition_events/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /idempotency_key/)
  assert.match(publicData, /from public\.events/)
  assert.match(publicPage, /Próximos eventos/)
  assert.match(formActions, /public_acquisition_events/)
  assert.match(formActions, /origin, source_key/)
  assert.match(formActions, /public_form/)
  assert.match(beacon, /utm_campaign/)
  assert.match(metrics, /reports\.view/)
})
