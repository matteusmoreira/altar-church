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
  assert.match(memberData, /own\.role in \('leader', 'coordinator'\)/)
  assert.match(volunteerAccess, /volunteer\.person_id = \$\{context\.personId\}/)
  assert.match(shell, /hasVolunteerPortal/)
  assert.match(shell, /\/membro\/voluntariado/)
})

test("leader opens the existing scoped ministry workspace from the portal", () => {
  const portal = read("src/components/member/member-ministries.tsx")
  const page = read("src/app/(member)/membro/ministerios/[id]/page.tsx")
  const actions = read("src/lib/ministries/actions.ts")
  assert.match(portal, /Configurar ministério/)
  assert.match(portal, /href=\{`\/membro\/ministerios\/\$\{ministry.id\}`\}/)
  assert.match(page, /requireMemberContext/)
  assert.match(page, /requireMinistryPermission[\s\S]*manage: true/)
  assert.match(page, /initialTab="configuracoes" memberPortal/)
  assert.match(actions, /const isAdmin = \["superadmin", "admin", "pastor"\]/)
  assert.match(actions, /if \(isAdmin\) \{[\s\S]*set leader_person_id/)
})

test("ministry leader has portal permissions, not administrative dashboard permissions", () => {
  const types = read("src/lib/types.ts")
  const leaderBlock = types.match(/ministry_leader:\s*\[([\s\S]*?)\n\s*\],\n\s*cell_supervisor:/)?.[1] ?? ""

  assert.match(leaderBlock, /ministries\.self\.view/)
  assert.match(leaderBlock, /kids\.guardian\.self/)
  assert.doesNotMatch(leaderBlock, /members\.view|ministries\.edit|volunteers\.view|schedules\.edit/)
})

test("database policies preserve administrator controls and membership review is ministry-scoped", () => {
  const migration = read("supabase/migrations/20260720220000_unified_member_portal_capabilities.sql")
  const actions = read("src/lib/member/actions.ts")

  assert.match(migration, /grant update \(name, description, contact, is_active\) on public\.ministries/)
  assert.match(migration, /create policy "Ministry leaders update own"/)
  assert.match(migration, /create policy "Ministry administrators delete"/)
  assert.match(actions, /requireMinistryPermission\(membership\.ministry_id, "ministries.members.manage", user.churchId, \{ manage: true \}\)/)
})

test("visitor and attendee invitations are normalized to member access", () => {
  const actions = read("src/lib/people/actions.ts")
  const client = read("src/app/(dashboard)/pessoas/members-client.tsx")

  assert.match(actions, /person\.person_type === "visitor" \|\| person\.person_type === "attendee"/)
  assert.match(actions, /const effectiveRole: PersonAccessRole/)
  assert.match(client, /Visitante e frequentador usam Portal do Membro/)
})
