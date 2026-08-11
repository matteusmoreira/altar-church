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

test("ministry workspace migration extends volunteer scope without parallel scale tables", () => {
  const sql = read("supabase/migrations/20260811100000_ministry_volunteer_scope.sql")
  for (const index of [
    "volunteer_departments_company_ministry_idx",
    "volunteer_roles_department_name_idx",
    "volunteer_event_positions_company_event_idx",
    "volunteer_shifts_company_event_idx",
    "ministry_memberships_active_person_idx",
  ]) assert.match(sql, new RegExp(index))
  assert.match(sql, /create or replace function public\.can_manage_volunteer_department/i)
  assert.match(sql, /ministry_memberships.*leader|leader.*ministry_memberships/is)
  assert.match(sql, /create or replace function public\.create_ministry_absence_follow_up/i)
  assert.doesNotMatch(sql, /create table.*scale|create table.*schedule/i)
})

test("ministries v2 server surface uses scoped actions and existing primitives", () => {
  const actions = read("src/lib/ministries/actions.ts")
  const data = read("src/lib/ministries/data.ts")
  const memberData = read("src/lib/member/data.ts")
  const workspace = read("src/components/ministries/ministry-workspace.tsx")
  for (const permission of ["ministries.members.manage", "ministries.teams.manage", "ministries.agenda.manage", "ministries.attendance.manage", "ministries.communication.send", "ministries.follow_up.manage"]) assert.match(actions, new RegExp(permission.replaceAll(".", "\\.")))
  assert.match(data, /getMinistryWorkspaceData/)
  assert.match(actions, /createNotificationCampaignDeliveries/)
  assert.match(actions, /personIds = \[\.\.\.new Set\(parsed\.personIds\)\]/)
  assert.match(actions, /audience_person_ids = .*snapshot\.personIds/)
  assert.match(actions, /materialize_volunteer_programmings/)
  for (const action of [
    "addMinistryMember",
    "saveMinistryScalePositions",
    "listMinistryScaleCandidates",
    "saveMinistryScaleAssignment",
    "publishMinistryScale",
  ]) assert.match(actions, new RegExp(`export async function ${action}`))
  for (const primitive of [
    "volunteer_departments",
    "volunteer_event_positions",
    "volunteer_schedules",
    "volunteer_shifts",
    "volunteer_assignments",
    "volunteer_delivery_outbox",
    "rankVolunteersForShift",
  ]) assert.match(actions, new RegExp(primitive))
  assert.match(actions, /saveMinistryOnboardingTemplate/)
  assert.match(actions, /uploadMinistryResource/)
  assert.match(read("src/lib/notifications/campaign.ts"), /membership\.left_at is null/)
  assert.match(read("src/lib/notifications/campaign.ts"), /return \{ recipientCount: people\.length, deliveryCount: inserted, personIds \}/)
  assert.match(actions, /Você só pode atualizar seu próprio onboarding/)
  assert.match(data, /createSignedUrlsByStoragePath/)
  assert.match(memberData, /event\.ministry_id is null or exists/)
  assert.match(workspace, /Visão geral|VisÃ£o geral/)
  assert.match(workspace, /Pessoas|Pessoas/)
  assert.match(workspace, /Equipes|Equipes/)
  assert.match(workspace, /Agenda|Agenda/)
  assert.match(workspace, /Adicionar pessoa/)
  assert.match(workspace, /Pessoas específicas/)
  assert.match(workspace, /Acompanhamentos/)
  assert.match(workspace, /Publicar escala/)
  assert.match(workspace, /Sem limite/)
  assert.match(workspace, /Registrar presença|Registrar presenÃ§a/)
  for (const contract of ["MinistryAvailablePerson", "MinistryScale", "MinistryScalePosition", "MinistryScaleCandidate"]) assert.match(read("src/lib/ministries/types.ts"), new RegExp(`interface ${contract}`))
})

test("ministry workspace route exists and administrative list links to it", () => {
  assert.ok(fs.existsSync(path.join(root, "src/app/(dashboard)/ministerios/[id]/page.tsx")))
  assert.ok(fs.existsSync(path.join(root, "src/app/api/ministerios/[id]/export/route.ts")))
  assert.match(read("src/app/(dashboard)/ministerios/ministries-client.tsx"), /ministerios\/\$\{ministry\.id\}/)
})

test("every ministry workspace form has an explicit submit button", () => {
  const workspace = read("src/components/ministries/ministry-workspace.tsx")
  const forms = [...workspace.matchAll(/<form\b[\s\S]*?<\/form>/g)].map((match) => match[0])

  assert.equal(forms.length, 11)
  for (const form of forms) assert.match(form, /<Button\b[^>]*\btype="submit"/)
})
