import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("cells hub migration adds supervisor, studies, QR, prayer, notices and private media", () => {
  const sql = read("supabase/migrations/20260715150000_cells_hub.sql")
  for (const table of ["cell_study_targets", "cell_checkin_sessions", "cell_prayer_requests", "cell_notices", "cell_notice_targets"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(sql, /cell_supervisor/)
  assert.match(sql, /31457280/)
  assert.match(sql, /delete from public\.system_modules where id = 'groups'/)
  assert.match(sql, /update public\.profiles[\s\S]*person_id/)
})

test("cell uploads enforce document, photo and quantity limits", () => {
  const actions = read("src/lib/cells/actions.ts")
  assert.match(actions, /CELL_STUDY_MAX_BYTES = 30 \* 1024 \* 1024/)
  assert.match(actions, /CELL_PHOTO_MAX_BYTES = 15 \* 1024 \* 1024/)
  assert.match(actions, /CELL_PHOTO_LIMIT = 30/)
  for (const extension of ["pdf", "doc", "docx", "xls", "xlsx", "txt"]) assert.match(actions, new RegExp(`\\.${extension}`))
  assert.match(actions, /allowedMimeTypes: studyMimeTypes/)
  assert.match(actions, /allowedExtensions: studyExtensions/)
})

test("cell check-in is authenticated, scoped and idempotent", () => {
  const actions = read("src/lib/cells/actions.ts")
  const access = read("src/lib/cells/access.ts")
  assert.match(actions, /cells\.self\.checkin/)
  assert.match(actions, /on conflict \(company_id, event_ref_id, person_id\)/)
  assert.match(actions, /session\.closed_at is null/)
  assert.match(actions, /checkin_source = 'qr'/)
  assert.match(actions, /checkin_source = 'manual'/)
  assert.match(access, /coordinator_person_id/)
  assert.match(access, /leader_person_id/)
})

test("canonical cells UI and APIs replace duplicate GCEU module", () => {
  const routes = read("src/lib/navigation/routes.ts")
  const layout = read("src/components/layout/dashboard-layout.tsx")
  const openapi = read("docs/api/openapi.yaml")
  assert.equal(existsSync("src/app/(dashboard)/celulas/cells-client.tsx"), false)
  assert.match(routes, /source: "\/gceus\/:path\*", destination: "\/celulas\/:path\*"/)
  assert.doesNotMatch(layout, /label: "GCEUs"/)
  assert.match(openapi, /\/cells:/)
  assert.match(openapi, /\/cell-studies:/)
  assert.match(openapi, /\/cell-checkins:/)
})

test("cell database optimization keeps tenant scope and targeted indexes", () => {
  const migration = read("supabase/migrations/20260715170000_cells_database_optimization.sql")
  assert.match(migration, /attendance_cell_meeting_status_idx/)
  assert.match(migration, /cell_checkin_sessions_company_group_created_idx/)
  assert.match(migration, /cell_prayer_requests_author_idx/)
  assert.match(migration, /people_company_phone_digits_idx/)
  assert.match(migration, /profile\.company_id = study\.company_id/)
})

test("profile and person identity backfill leaves only global profiles unlinked", () => {
  const migration = read("supabase/migrations/20260715173000_profiles_people_identity_backfill.sql")
  assert.match(migration, /lower\(person\.email\) = lower\(profile\.email\)/)
  assert.match(migration, /insert into public\.people/)
  assert.match(migration, /profile\.company_id is not null/)
  assert.match(migration, /set person_id = person\.id/)
})
