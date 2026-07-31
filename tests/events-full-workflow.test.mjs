import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("Eventos full workflow persists public registration, QR, resources and communication contracts", () => {
  const migration = read("supabase/migrations/20260731230000_events_full_workflow.sql")
  const indexes = read("supabase/migrations/20260731233000_events_full_workflow_indexes.sql")
  const audienceMigration = read("supabase/migrations/20260731234500_events_communication_audiences.sql")
  const formMigration = read("supabase/migrations/20260731240000_events_form_link.sql")
  assert.match(migration, /event_guest_registrations/)
  assert.match(migration, /event_checkin_sessions/)
  assert.match(migration, /event_attendee_tokens/)
  assert.match(migration, /attendance_records_event_guest_unique/)
  assert.match(migration, /notification_deliveries_guest_idx/)
  assert.match(indexes, /event_guest_registrations_event_fk_idx/)
  assert.match(audienceMigration, /event_ministry/)
  assert.match(formMigration, /registration_form_id/)
})

test("Eventos full workflow exposes privacy-safe public routes and authorized export", () => {
  assert.equal(existsSync("src/app/(public)/eventos/publico/[token]/page.tsx"), true)
  assert.equal(existsSync("src/app/(public)/eventos/inscricao/[token]/page.tsx"), true)
  assert.equal(existsSync("src/app/(public)/eventos/check-in/[token]/page.tsx"), true)
  assert.equal(existsSync("src/app/(public)/eventos/check-in/sessao/[token]/page.tsx"), true)
  const publicData = read("src/lib/events/data.ts")
  const actions = read("src/lib/events/actions.ts")
  const exportRoute = read("src/app/api/v1/events/[id]/participants/export/route.ts")
  assert.match(publicData, /public_token/)
  assert.match(publicData, /event_guest_registrations/)
  assert.match(actions, /registrationEnabled|registerGuestForEvent/)
  assert.match(actions, /for update/)
  assert.match(actions, /createEventGuestCrmProfile/)
  assert.match(exportRoute, /reports\.export/)
  assert.match(exportRoute, /\.xls/)
})

test("Eventos full workflow keeps mixed capacity, idempotent check-in and recurring series linked", () => {
  const portalActions = read("src/lib/member/portal-actions.ts")
  const eventActions = read("src/lib/events/actions.ts")
  const operationalActions = read("src/lib/operational/actions.ts")
  assert.match(portalActions, /event_guest_registrations/)
  assert.match(portalActions, /for update/)
  assert.match(eventActions, /on conflict \(company_id, event_ref_id, person_id\)/)
  assert.match(eventActions, /on conflict \(company_id, event_ref_id, guest_registration_id\)/)
  assert.match(operationalActions, /materialize_volunteer_programmings/)
  assert.match(operationalActions, /registration_form_id/)
})

test("Eventos full workflow exposes reports, follow-up, templates and delivery status", () => {
  const reportData = read("src/lib/events/data.ts")
  const reportPage = read("src/app/(dashboard)/relatorios/reports-client.tsx")
  const detail = read("src/app/(dashboard)/eventos/event-detail-client.tsx")
  const delivery = read("src/lib/notifications/delivery.ts")
  assert.match(reportData, /getEventReport/)
  assert.match(reportData, /getEventDashboardSummary/)
  assert.match(reportPage, /Eventos por tipo/)
  assert.match(detail, /Últimas comunicações/)
  assert.match(delivery, /status = 'dead'/)
})
