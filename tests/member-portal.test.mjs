import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("member is the canonical self-service role", () => {
  const types = read("src/lib/types.ts")
  const register = read("src/lib/auth/register.ts")
  assert.match(types, /export type UserRole[\s\S]*"member"/)
  assert.doesNotMatch(types, /\|\s*"reader"/)
  assert.doesNotMatch(types, /\|\s*"guardian"/)
  assert.match(register, /role: "member"/)
  assert.match(register, /'member', true/)
  assert.match(register, /insert into public\.people/)
})

test("member portal has isolated shell, base destinations and conditional volunteer access", () => {
  const shell = read("src/components/member/member-shell.tsx")
  const dashboard = read("src/components/member/member-dashboard.tsx")
  for (const path of ["/membro", "/membro/celulas", "/membro/ministerios", "/membro/kids"]) {
    assert.match(shell, new RegExp(path.replaceAll("/", "\\/")))
  }
  assert.match(shell, /safe-area-inset-bottom/)
  assert.match(shell, /lg:hidden/)
  assert.match(shell, /hasVolunteerPortal/)
  assert.match(shell, /\/membro\/voluntariado/)
  assert.match(dashboard, /Próximo encontro/)
  assert.match(dashboard, /Avisos recentes/)
})

test("ministry membership contract is tenant-scoped, audited and approval based", () => {
  const migration = read("supabase/migrations/20260720160000_member_portal.sql")
  const actions = read("src/lib/member/actions.ts")
  assert.match(migration, /create table if not exists public\.ministry_memberships/)
  assert.match(migration, /'pending', 'active', 'rejected', 'inactive'/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /profile\.company_id = ministry_memberships\.company_id/)
  assert.match(actions, /ministry\.membership\.request/)
  assert.match(actions, /requireMemberContext/)
  assert.match(actions, /leader_person_id = \$\{personId\}/)
})

test("assigning a ministry leader grants membership and linked leader access", () => {
  const migration = read("supabase/migrations/20260720200000_sync_ministry_leader_role.sql")
  const data = read("src/lib/member/data.ts")
  const portal = read("src/components/member/member-ministries.tsx")
  assert.match(migration, /create trigger ministries_sync_leader_role/)
  assert.match(migration, /role = 'ministry_leader'/)
  assert.match(migration, /role = 'leader'/)
  assert.match(migration, /status = 'active'/)
  assert.match(migration, /Lider do ministerio deve pertencer a mesma igreja/)
  assert.match(data, /own\.role as membership_role/)
  assert.match(portal, /membershipRole === "leader"/)
})

test("portal roles cannot enter the administrative dashboard and legacy family portal redirects", () => {
  const dashboardLayout = read("src/app/(dashboard)/layout.tsx")
  const familyPage = read("src/app/(portal)/familia/kids/page.tsx")
  const memberAccess = read("src/lib/member/access.ts")
  assert.match(dashboardLayout, /isPortalRole\(user\.role\)[\s\S]*redirect\("\/membro"\)/)
  assert.match(familyPage, /redirect\("\/membro\/kids"\)/)
  assert.match(memberAccess, /!isPortalRole\(user\.role\)/)
})
