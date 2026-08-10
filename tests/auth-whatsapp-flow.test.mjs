import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("migration protege login por WhatsApp e desafios OTP", () => {
  const migration = read("supabase/migrations/20260810120000_whatsapp_login_password_recovery.sql")
  const hardening = read("supabase/migrations/20260810121000_whatsapp_auth_audit_hardening.sql")
  assert.match(migration, /add column if not exists login_phone text/)
  assert.match(migration, /unique index[\s\S]*profiles_login_phone_unique_idx/)
  assert.match(migration, /create table if not exists public\.auth_password_reset_challenges/)
  assert.match(migration, /company_id uuid not null/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.auth_password_reset_challenges from public, anon, authenticated/)
  assert.doesNotMatch(migration, /grant .*auth_password_reset_challenges.*authenticated/i)
  assert.match(hardening, /auth_password_reset_company_idx/)
  assert.match(hardening, /to anon, authenticated[\s\S]*using \(false\)[\s\S]*with check \(false\)/)
})

test("recuperação é anti-enumeração, limitada e exclui superadmin", () => {
  const recovery = read("src/lib/auth/password-recovery.ts")
  const payload = read("src/lib/auth/password-recovery-payload.ts")
  assert.match(recovery, /role <> 'superadmin'/)
  assert.match(recovery, /profile_requests[\s\S]*>= 3/)
  assert.match(recovery, /ip_requests[\s\S]*>= 20/)
  assert.match(recovery, /interval '10 minutes'/)
  assert.match(recovery, /attempt_count >= 5/)
  assert.match(recovery, /return publicRequestResult\(requestId\)/)
  assert.match(recovery, /get_company_uazapi_credential/)
  assert.match(payload, /type: "button"/)
  assert.match(payload, /Copiar código\|copy:\$\{input\.code\}/)
  assert.match(payload, /track_source: "altar_church_auth"/)
  assert.doesNotMatch(recovery, /console\.(?:log|error)\([^\n]*(?:code|token|email|phone)/i)
})

test("login oferece e-mail e WhatsApp sem revelar o e-mail resolvido", () => {
  const loginAction = read("src/lib/auth/login-actions.ts")
  const loginPage = read("src/app/(auth)/login/page.tsx")
  assert.match(loginAction, /login_phone = \$\{normalizedPhone\}/)
  assert.match(loginAction, /signInWithPassword/)
  assert.doesNotMatch(loginAction, /return \{[^}]*email/)
  assert.match(loginPage, /Login por WhatsApp/)
  assert.match(loginPage, /Login por e-mail/)
  assert.match(loginPage, /login-method-whatsapp/)
  assert.match(loginPage, /\/recuperar-senha/)
})

test("cadastro exige WhatsApp e o salva no perfil e na pessoa", () => {
  const action = read("src/lib/auth/register.ts")
  const page = read("src/app/(auth)/register/page.tsx")
  assert.match(action, /whatsapp:/)
  assert.match(action, /login_phone/)
  assert.match(action, /phone, access_profile/)
  assert.match(action, /WhatsApp não confere com o cadastro existente/)
  assert.match(page, /formatBrazilianWhatsapp/)
  assert.match(page, /Será usado para entrar e recuperar sua senha/)
})
