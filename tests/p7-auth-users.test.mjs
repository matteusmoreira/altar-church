import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const adminActions = readFileSync("src/lib/admin/actions.ts", "utf8")
const adminUi = readFileSync("src/components/admin/superadmin-console.tsx", "utf8")
const supabaseAdmin = readFileSync("src/lib/supabase/admin.ts", "utf8")
const supabaseEnv = readFileSync("src/lib/supabase/env.ts", "utf8")
const authServer = readFileSync("src/lib/auth/server.ts", "utf8")

const tenantContextFiles = [
  "src/lib/church-info/actions.ts",
  "src/lib/church-info/data.ts",
  "src/lib/congregations/actions.ts",
  "src/lib/congregations/data.ts",
  "src/lib/content/actions.ts",
  "src/lib/content/data.ts",
  "src/lib/export/server.ts",
  "src/lib/files/actions.ts",
  "src/lib/groups/actions.ts",
  "src/lib/groups/data.ts",
  "src/lib/operational/actions.ts",
  "src/lib/operational/data.ts",
  "src/lib/pastoral/actions.ts",
  "src/lib/pastoral/data.ts",
  "src/lib/people/actions.ts",
  "src/lib/people/data.ts",
]

test("superadmin profile creation can invite and link Supabase Auth users", () => {
  assert(adminActions.includes("ensureAuthUserForProfile"))
  assert(adminActions.includes("inviteUserByEmail"))
  assert(adminActions.includes("createUser"))
  assert(adminActions.includes("auth_user_id"))
  assert(adminActions.includes("authUserLinked"))
  assert.match(adminActions, /password/)
  assert.match(adminUi, /profile-password/)
  assert.match(adminUi, /Senha \*/)
})

test("superadmin can reset passwords and block Auth access for inactive profiles", () => {
  assert.match(adminActions, /export async function sendProfilePasswordReset/)
  assert.match(adminActions, /export async function setProfilePassword/)
  assert.match(adminActions, /generateLink\(\{\s*type: "recovery"/)
  assert.match(adminActions, /ban_duration: parsed\.active \? "none" : "876000h"/)
  assert.match(adminActions, /profile\.password_reset/)
  assert.match(adminActions, /authAccessBlocked/)
  assert.match(adminUi, /setProfilePassword/)
  assert.match(adminUi, /Redefinir senha/)
  assert.match(adminUi, /reset-password/)
})

test("Supabase admin client only uses service role on the server", () => {
  assert(supabaseEnv.includes("SUPABASE_SERVICE_ROLE_KEY"))
  assert(supabaseAdmin.includes("persistSession: false"))
  assert(supabaseAdmin.includes("autoRefreshToken: false"))
})

test("superadmin without assigned church uses the first active church across operational modules", () => {
  assert.match(authServer, /coalesce\(\s*p\.company_id,[\s\S]*p\.role = 'superadmin'[\s\S]*from public\.companies c[\s\S]*c\.active = true/i)
  assert.match(authServer, /export function requireUserCompanyId/)

  for (const file of tenantContextFiles) {
    const source = readFileSync(file, "utf8")
    assert.match(source, /requireUserCompanyId\(user|getCellContext\(/, `${file} must use the shared tenant resolver`)
  }
})
