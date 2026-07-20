import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("member portal derives volunteer and ministry capabilities from linked records", () => {
  const memberData = read("src/lib/member/data.ts")
  const volunteerAccess = read("src/lib/volunteers/access.ts")
  const shell = read("src/components/member/member-shell.tsx")

  assert.match(memberData, /from public\.volunteer_profiles volunteer/)
  assert.match(memberData, /volunteer\.registration_status = 'active'/)
  assert.match(memberData, /ministry\.leader_person_id = \$\{personId\} as can_manage/)
  assert.match(volunteerAccess, /volunteer\.person_id = \$\{context\.personId\}/)
  assert.match(shell, /hasVolunteerPortal/)
  assert.match(shell, /\/membro\/voluntariado/)
})

test("leader self-service update is field-limited and relation-scoped", () => {
  const actions = read("src/lib/member/actions.ts")
  const portal = read("src/components/member/member-ministries.tsx")
  const ownUpdate = actions.slice(
    actions.indexOf("export async function updateOwnMinistrySettings"),
    actions.indexOf("export async function reviewMinistryMembership"),
  )
  const setClause = ownUpdate.match(/update public\.ministries\s+set([\s\S]*?)\s+where/)?.[1] ?? ""

  assert.match(ownUpdate, /set name = \$\{parsed\.name\}/)
  assert.match(ownUpdate, /description = \$\{parsed\.description\}/)
  assert.match(ownUpdate, /contact = \$\{parsed\.contact\}/)
  assert.match(ownUpdate, /is_active = \$\{parsed\.isActive\}/)
  assert.match(ownUpdate, /leader_person_id = \$\{personId\}/)
  assert.doesNotMatch(setClause, /leader_person_id\s*=/)
  assert.match(portal, /Configurar ministério/)
})

test("ministry leader has portal permissions, not administrative dashboard permissions", () => {
  const types = read("src/lib/types.ts")
  const leaderBlock = types.match(/ministry_leader:\s*\[([\s\S]*?)\n\s*\],\n\s*cell_supervisor:/)?.[1] ?? ""

  assert.match(leaderBlock, /ministries\.self\.view/)
  assert.match(leaderBlock, /kids\.guardian\.self/)
  assert.doesNotMatch(leaderBlock, /members\.view|ministries\.edit|volunteers\.view|schedules\.edit/)
})

test("database policies prevent leader reassignment, deletion and membership review", () => {
  const migration = read("supabase/migrations/20260720220000_unified_member_portal_capabilities.sql")
  const actions = read("src/lib/member/actions.ts")

  assert.match(migration, /grant update \(name, description, contact, is_active\) on public\.ministries/)
  assert.match(migration, /create policy "Ministry leaders update own"/)
  assert.match(migration, /create policy "Ministry administrators delete"/)
  assert.match(actions, /!\["superadmin", "admin", "pastor"\]\.includes\(user\.role\)/)
})

test("visitor and attendee invitations are normalized to member access", () => {
  const actions = read("src/lib/people/actions.ts")
  const client = read("src/app/(dashboard)/pessoas/members-client.tsx")

  assert.match(actions, /person\.person_type === "visitor" \|\| person\.person_type === "attendee"/)
  assert.match(actions, /const effectiveRole: PersonAccessRole/)
  assert.match(client, /Visitante e frequentador usam Portal do Membro/)
})
