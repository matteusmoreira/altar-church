import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("Release 1 exposes event list and operational detail route", () => {
  assert.equal(existsSync("src/app/(dashboard)/eventos/[id]/page.tsx"), true)
  assert.match(read("src/app/(dashboard)/eventos/page.tsx"), /EventFilters/)
  assert.match(read("src/app/(dashboard)/eventos/events-list-view.tsx"), /"list".*"month".*"week"/s)
  assert.match(read("src/app/(dashboard)/eventos/event-detail-client.tsx"), /participants|attendance|volunteer|communication|files/)
})

test("event reads keep tenant scope across event, RSVP, attendance and scale", () => {
  const source = read("src/lib/operational/data.ts")
  assert.match(source, /requirePermission\("events\.view"/)
  assert.match(source, /event\.company_id = \$\{companyId\}/)
  assert.match(source, /rsvp\.company_id = \$\{companyId\}/)
  assert.match(source, /from public\.attendance_records/)
  assert.match(source, /where company_id = \$\{companyId\} and event_ref_id = \$\{eventId\}/)
  assert.match(source, /shift\.company_id = \$\{companyId\}/)
})

test("event mutations validate operational rules and write audit trail", () => {
  const source = read("src/lib/operational/actions.ts")
  assert.match(source, /Fim deve ser igual ou posterior ao início/)
  assert.match(source, /Capacidade não pode ser negativa/)
  assert.match(source, /URL HTTP ou HTTPS válida/)
  assert.match(source, /event\.duplicate/)
  assert.match(source, /status: z\.enum\(\["published", "cancelled"\]\)/)
  assert.match(source, /writeAuditLog/)
  assert.match(source, /events\.edit/)
  assert.match(source, /events\.delete/)
})
