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

test("member portal has isolated shell and four mobile-first destinations", () => {
  const shell = read("src/components/member/member-shell.tsx")
  const dashboard = read("src/components/member/member-dashboard.tsx")
  for (const path of ["/membro", "/membro/celulas", "/membro/ministerios", "/membro/kids"]) {
    assert.match(shell, new RegExp(path.replaceAll("/", "\\/")))
  }
  assert.match(shell, /safe-area-inset-bottom/)
  assert.match(shell, /lg:hidden/)
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
  assert.match(actions, /user\.role === "ministry_leader"/)
  assert.match(actions, /membership\.leader_person_id !== membership\.profile_person_id/)
})

test("member cannot enter the administrative dashboard and legacy family portal redirects", () => {
  const dashboardLayout = read("src/app/(dashboard)/layout.tsx")
  const familyPage = read("src/app/(portal)/familia/kids/page.tsx")
  const memberAccess = read("src/lib/member/access.ts")
  assert.match(dashboardLayout, /user\.role === "member"[\s\S]*redirect\("\/membro"\)/)
  assert.match(familyPage, /redirect\("\/membro\/kids"\)/)
  assert.match(memberAccess, /user\.role !== "member"/)
})
