import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(path, "utf8")
const migration = read("supabase/migrations/20260710130000_volunteer_management.sql")
const actions = read("src/lib/volunteers/actions.ts")
const data = read("src/lib/volunteers/data.ts")
const worker = read("supabase/functions/volunteer-delivery-worker/index.ts")
const webhook = read("src/app/api/webhooks/resend/route.ts")
const routes = read("src/lib/navigation/routes.ts")

test("P9 persists volunteer schedules, feed, check-in and outbox with tenant RLS", () => {
  for (const table of [
    "volunteer_profiles", "volunteer_departments", "volunteer_department_memberships",
    "volunteer_schedule_templates", "volunteer_schedule_template_slots", "volunteer_schedules",
    "volunteer_shifts", "volunteer_assignments", "volunteer_checkin_qr_sessions",
    "volunteer_feed_posts", "volunteer_feed_reads", "volunteer_delivery_outbox",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /alter table public\.events\s+add column if not exists volunteer_template_id/i)
  assert.match(migration, /claim_volunteer_delivery_batch/)
  assert.match(migration, /for update skip locked/i)
})

test("P9 actions validate, authorize, audit and scope self check-in", () => {
  for (const schema of ["volunteerSchema", "departmentSchema", "templateSchema", "scheduleSchema", "assignmentSchema", "feedSchema", "checkinSchema"]) {
    assert.match(actions, new RegExp(`const ${schema} = z\\.object`))
  }
  for (const action of ["saveVolunteer", "generateMonthlyVolunteerSchedule", "publishVolunteerSchedule", "saveVolunteerFeedPost", "checkInVolunteerAssignment"]) {
    assert.match(actions, new RegExp(`export async function ${action}`))
  }
  assert.match(actions, /requirePermission\("volunteer\.self\.checkin"/)
  assert.match(actions, /profile\.id = \$\{user\.id\}/)
  assert.match(actions, /writeAuditLog/)
  assert.match(data, /listVolunteerTemplatesForEvents/)
})

test("P9 exposes module route and durable provider delivery", () => {
  assert.match(routes, /"volunteers": "\/voluntariado"/)
  assert.match(worker, /track_source: "altar_church_volunteers"/)
  assert.match(worker, /Idempotency-Key/)
  assert.match(worker, /claim_volunteer_delivery_batch/)
  assert.match(webhook, /resend\.webhooks\.verify/)
  assert.match(webhook, /svix-id/)
})
