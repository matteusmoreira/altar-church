import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const adminActions = readFileSync("src/lib/admin/actions.ts", "utf8")
const adminUi = readFileSync("src/components/admin/superadmin-console.tsx", "utf8")
const supabaseAdmin = readFileSync("src/lib/supabase/admin.ts", "utf8")
const supabaseEnv = readFileSync("src/lib/supabase/env.ts", "utf8")

test("superadmin profile creation can invite and link Supabase Auth users", () => {
  assert(adminActions.includes("ensureAuthUserForProfile"))
  assert(adminActions.includes("inviteUserByEmail"))
  assert(adminActions.includes("auth_user_id"))
  assert(adminActions.includes("authUserLinked"))
})

test("superadmin can reset passwords and block Auth access for inactive profiles", () => {
  assert.match(adminActions, /export async function sendProfilePasswordReset/)
  assert.match(adminActions, /generateLink\(\{\s*type: "recovery"/)
  assert.match(adminActions, /ban_duration: parsed\.active \? "none" : "876000h"/)
  assert.match(adminActions, /profile\.password_reset/)
  assert.match(adminActions, /authAccessBlocked/)
  assert.match(adminUi, /sendProfilePasswordReset/)
  assert.match(adminUi, /Resetar senha/)
})

test("Supabase admin client only uses service role on the server", () => {
  assert(supabaseEnv.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert(supabaseAdmin.includes("persistSession: false"))
  assert(supabaseAdmin.includes("autoRefreshToken: false"))
})
