import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

test("ministries v2 migration keeps additive scoped contract", () => {
  const sql = read("supabase/migrations/20260801090000_ministries_v2.sql")
  for (const column of ["ministry_type", "mission", "target_audience", "meeting_day", "meeting_time", "meeting_location", "image_file_id", "public_join_enabled"]) assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"))
  for (const fn of ["ministry_current_profile_id", "ministry_current_person_id", "can_access_ministry", "can_manage_ministry", "can_manage_ministry_team"]) assert.match(sql, new RegExp(`function public\\.${fn}`, "i"))
  for (const table of ["groups", "group_members", "programmings", "events", "attendance_records", "person_follow_up_tasks"]) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
  assert.match(sql, /ensure_ministry_group_member/i)
  assert.match(sql, /create_ministry_absence_follow_up/i)
  assert.match(sql, /on conflict \(ministry_id, person_id\)/i)
})

test("ministries v2 server surface uses scoped actions and existing primitives", () => {
  const actions = read("src/lib/ministries/actions.ts")
  const data = read("src/lib/ministries/data.ts")
  const memberData = read("src/lib/member/data.ts")
  const workspace = read("src/components/ministries/ministry-workspace.tsx")
  for (const permission of ["ministries.members.manage", "ministries.teams.manage", "ministries.agenda.manage", "ministries.attendance.manage", "ministries.communication.send", "ministries.follow_up.manage"]) assert.match(actions, new RegExp(permission.replaceAll(".", "\\.")))
  assert.match(data, /getMinistryWorkspaceData/)
  assert.match(actions, /createNotificationCampaignDeliveries/)
  assert.match(actions, /materialize_volunteer_programmings/)
  assert.match(actions, /saveMinistryOnboardingTemplate/)
  assert.match(actions, /uploadMinistryResource/)
  assert.match(actions, /Você só pode atualizar seu próprio onboarding/)
  assert.match(data, /createSignedUrlsByStoragePath/)
  assert.match(memberData, /event\.ministry_id is null or exists/)
  assert.match(workspace, /Visão geral|VisÃ£o geral/)
  assert.match(workspace, /Pessoas|Pessoas/)
  assert.match(workspace, /Equipes|Equipes/)
  assert.match(workspace, /Agenda|Agenda/)
  assert.match(workspace, /Registrar presença|Registrar presenÃ§a/)
})

test("ministry workspace route exists and administrative list links to it", () => {
  assert.ok(fs.existsSync(path.join(root, "src/app/(dashboard)/ministerios/[id]/page.tsx")))
  assert.ok(fs.existsSync(path.join(root, "src/app/api/ministerios/[id]/export/route.ts")))
  assert.match(read("src/app/(dashboard)/ministerios/ministries-client.tsx"), /ministerios\/\$\{ministry\.id\}/)
})
