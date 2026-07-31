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

test("cell first-use flows do not require a study and expose usable empty states", () => {
  const client = read("src/app/(dashboard)/celulas/cell-features-client.tsx")
  const cellActions = read("src/lib/cells/actions.ts")
  const groupPanel = read("src/app/(dashboard)/gceus/group-operations-panel.tsx")
  const groupActions = read("src/lib/groups/actions.ts")
  const files = read("src/lib/files/server.ts")

  assert.match(client, /defaultChecked/)
  assert.match(client, /data\.canPublishToAll &&/)
  assert.match(client, /data\.studies\.length === 0/)
  assert.match(client, /data\.meetings\.length === 0/)
  assert.match(client, /<Button type="submit" disabled=\{pending\}><Upload \/>Enviar estudo/)
  assert.match(groupPanel, /Sem estudo \(opcional\)/)
  assert.doesNotMatch(groupPanel, /if \(meetingForm\.studyId === "none"\)/)
  assert.doesNotMatch(groupActions, /Selecione o estudo do encontro/)
  assert.doesNotMatch(cellActions, /!meeting\.study_id/)
  assert.match(cellActions, /meeting\.report_status === "cancelled"/)
  assert.match(cellActions, /allowGenericMimeByExtension: true/)
  assert.match(files, /const contentType = input\.contentType/)
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

test("cell check-in keeps exact timestamp and appears in member dashboard", () => {
  const migration = read("supabase/migrations/20260730210000_cell_checkin_timestamps.sql")
  const actions = read("src/lib/cells/actions.ts")
  const memberData = read("src/lib/member/data.ts")
  const memberDashboard = read("src/components/member/member-dashboard.tsx")
  assert.match(migration, /add column if not exists checkin_at timestamptz/)
  assert.match(actions, /checkin_source, checkin_session_id, checkin_at/)
  assert.match(actions, /checkin_at = now\(\)/)
  assert.match(memberData, /recentCellCheckins/)
  assert.match(memberData, /attendance\.checkin_at/)
  assert.match(memberDashboard, /Check-ins nas células/)
  assert.match(memberDashboard, /Check-in realizado/)
})

test("admin has a dedicated cell summary option", () => {
  const client = read("src/app/(dashboard)/celulas/cell-features-client.tsx")
  assert.match(client, /TabsTrigger value="resumo"/)
  assert.match(client, /Resumo geral das células/)
  assert.match(client, /Ver resumo completo/)
  assert.match(client, /setSelectedSummaryCellId\(cell\.id\)/)
})

test("admins and cell leaders can delete studies only inside their allowed scope", () => {
  const actions = read("src/lib/cells/actions.ts")
  const data = read("src/lib/cells/data.ts")
  const client = read("src/app/(dashboard)/celulas/cell-features-client.tsx")
  const leaderWorkspace = read("src/components/member/cell-leader-workspace.tsx")

  assert.match(actions, /export async function deleteCellStudy/)
  assert.match(actions, /study\.audience = 'selected'/)
  assert.match(actions, /cell\.leader_person_id is distinct from/)
  assert.match(actions, /set is_active = false, deleted_at = now\(\)/)
  assert.match(actions, /update public\.group_meetings[\s\S]*set study_id = null/)
  assert.match(data, /can_delete: boolean/)
  assert.match(client, /data\.canDeleteStudies &&/)
  assert.match(leaderWorkspace, /study\.canDelete/)
  assert.match(leaderWorkspace, /deleteCellStudy/)
})

test("cell notices use rich editor buttons and sanitize unsafe content", () => {
  const editor = read("src/components/ui/rich-text-editor.tsx")
  const richContent = read("src/lib/cells/rich-content.ts")
  const actions = read("src/lib/cells/actions.ts")
  const client = read("src/app/(dashboard)/celulas/cell-features-client.tsx")
  assert.match(editor, /contentEditable/)
  assert.match(editor, /Inserir botão/)
  assert.match(richContent, /data-cell-button/)
  assert.match(richContent, /url\.protocol === "http:" \|\| url\.protocol === "https:"/)
  assert.match(actions, /sanitizeCellNoticeHtml/)
  assert.match(client, /RichTextEditor/)
  assert.match(client, /dangerouslySetInnerHTML/)
})

test("profile and person identity backfill leaves only global profiles unlinked", () => {
  const migration = read("supabase/migrations/20260715173000_profiles_people_identity_backfill.sql")
  assert.match(migration, /lower\(person\.email\) = lower\(profile\.email\)/)
  assert.match(migration, /insert into public\.people/)
  assert.match(migration, /profile\.company_id is not null/)
  assert.match(migration, /set person_id = person\.id/)
})
