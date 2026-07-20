import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")
const migration = read("supabase/migrations/20260720213000_volunteer_recovery.sql")
const actions = read("src/lib/volunteers/actions.ts")
const v2Actions = read("src/lib/volunteers/v2-actions.ts")
const data = read("src/lib/volunteers/data.ts")
const workspace = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")

test("volunteer creation links an existing tenant person and preserves person classification", () => {
  assert.match(actions, /export async function searchVolunteerPeople/)
  assert.match(actions, /if \(query\.length < 3\)/)
  assert.match(actions, /person\.company_id = \$\{companyId\}/)
  assert.match(actions, /person\.deleted_at is null/)
  assert.match(actions, /person\.is_active/)
  assert.match(actions, /personId: uuid/)
  assert.doesNotMatch(actions, /update public\.people[\s\S]{0,400}person_type = 'volunteer'/)
  assert.doesNotMatch(actions, /insert into public\.people/)
})

test("roles are stable ids across memberships, models and event positions", () => {
  assert.match(migration, /volunteer_schedule_template_slots[\s\S]*role_id uuid/)
  assert.match(migration, /create table if not exists public\.volunteer_event_positions/)
  assert.match(migration, /volunteer_memberships_role_unique/)
  assert.match(actions, /roleId: uuid/)
  assert.match(actions, /role_id, role_name, preferred/)
  assert.match(data, /rolesByDepartment/)
  assert.match(data, /membershipsByVolunteer/)
})

test("event schedule generation is draft-only and idempotent", () => {
  assert.match(v2Actions, /export async function saveVolunteerServicePlan/)
  assert.match(v2Actions, /export async function generateVolunteerScheduleForEvent/)
  assert.match(v2Actions, /export async function publishVolunteerEventSchedule/)
  assert.match(v2Actions, /event\.status !== "published"/)
  assert.match(v2Actions, /event\.volunteer_schedule_published_at/)
  assert.match(v2Actions, /on conflict \(schedule_id, event_id, event_position_id\)/)
  assert.match(v2Actions, /generateSmartVolunteerSchedule\(schedule\.id\)/)
  assert.match(v2Actions, /'proposed'/)
})

test("manager UI uses five operational areas and no worship catalog", () => {
  const manager = workspace.slice(
    workspace.indexOf("export function VolunteerManagerV2"),
    workspace.indexOf("function urlBase64ToUint8Array"),
  )
  assert.equal((manager.match(/<TabsTrigger/g) ?? []).length, 5)
  assert.match(workspace, /Digite ao menos 3 letras para buscar em Pessoas/)
  assert.match(workspace, /Gerar rascunho/)
  assert.match(workspace, /Roteiro do culto/)
  assert.doesNotMatch(workspace, /Adicionar música do catálogo/)
  assert.doesNotMatch(workspace, /Culto e Louvor/)
})
