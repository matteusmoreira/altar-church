import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("migration links people to profiles for system access", () => {
  const sql = read("supabase/migrations/20260714120000_people_profile_access.sql")
  assert.match(sql, /add column if not exists profile_id/i)
  assert.match(sql, /references public\.profiles\(id\)/i)
  assert.match(sql, /people_profile_id_unique_idx/i)
})

test("people actions invite access with temp password and role guard", () => {
  const actions = read("src/lib/people/actions.ts")
  const types = read("src/lib/people/types.ts")
  const routeActions = read("src/app/(dashboard)/pessoas/actions.ts")

  assert.match(types, /export type PersonAccessRole/)
  assert.match(types, /export interface InvitePersonAccessInput/)
  assert.match(types, /inviteAccess\?:/)
  assert.match(types, /temporaryPassword\?:/)
  assert.match(types, /hasSystemAccess/)

  assert.match(actions, /export async function invitePersonAccess/)
  assert.match(actions, /provisionPersonAccess/)
  assert.match(actions, /ensureAuthUserWithPassword/)
  assert.match(actions, /Apenas admin ou pastor/)
  assert.match(actions, /person\.invite_access/)
  assert.match(actions, /person\.reset_access/)
  assert.match(actions, /temporaryPassword/)
  assert.doesNotMatch(actions, /metadata:[\s\S]{0,120}password/)

  assert.match(routeActions, /invitePersonAccess/)
})

test("people data exposes access linkage fields", () => {
  const data = read("src/lib/people/data.ts")
  assert.match(data, /p\.profile_id/)
  assert.match(data, /pr\.role as access_role/)
  assert.match(data, /left join public\.profiles pr on pr\.id = p\.profile_id/i)
  assert.match(data, /hasSystemAccess:/)
})

test("members UI allows invite on form and detail for admin/pastor", () => {
  const listClient = read("src/app/(dashboard)/pessoas/members-client.tsx")
  const detailClient = read("src/app/(dashboard)/pessoas/[id]/member-detail-client.tsx")

  assert.match(listClient, /Convidar para o sistema/)
  assert.match(listClient, /inviteAccess/)
  assert.match(listClient, /temporaryPassword/)
  assert.match(listClient, /canInviteAccess/)
  assert.match(listClient, /Com acesso/)

  assert.match(detailClient, /invitePersonAccess/)
  assert.match(detailClient, /Acesso ao sistema/)
  assert.match(detailClient, /Convidar acesso/)
  assert.match(detailClient, /Redefinir senha/)
})
