import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { assertSafeWebhookUrl, isPrivateOrLocalHostname } from "../src/lib/integrations/crypto.ts"
import { toCsv } from "../src/lib/export/csv.ts"
import { assertCompanyScope } from "../src/lib/security/tenant-scope.ts"

test("CSV neutraliza fórmulas sem alterar números", () => {
  const csv = toCsv([["=1+1", "+cmd", "-2+3", "@cmd", -2, "normal"]])
  assert.match(csv, /'=1\+1/)
  assert.match(csv, /'\+cmd/)
  assert.match(csv, /'-2\+3/)
  assert.match(csv, /'@cmd/)
  assert.match(csv, /;-2;/)
  assert.match(csv, /normal/)
})

test("SSRF bloqueia loopback, redes privadas e URLs com credenciais", () => {
  for (const hostname of [
    "127.0.0.1",
    "127.0.0.2",
    "10.0.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "[::1]",
    "[0:0:0:0:0:0:0:1]",
    "[0:0:0:0:0:0:0:0]",
    "[::ffff:127.0.0.1]",
    "[fd00::1]",
    "[fe80::1]",
    "metadata.google.internal",
  ]) {
    assert.equal(isPrivateOrLocalHostname(hostname), true, hostname)
  }
  assert.equal(isPrivateOrLocalHostname("hooks.example.com"), false)
  assert.throws(() => assertSafeWebhookUrl("https://user:pass@example.com"), /credenciais/)
})

test("tenant scope falha fechado e mantém o mesmo tenant", () => {
  assert.doesNotThrow(() => assertCompanyScope("company-a", "company-a"))
  assert.throws(() => assertCompanyScope("company-a", "company-b"), /Acesso negado/)
  assert.throws(() => assertCompanyScope("company-a", null), /Acesso negado/)
})

test("fluxos corrigidos mantêm invariantes de tenant e rate limit público", () => {
  const v2 = readFileSync("src/lib/volunteers/v2-actions.ts", "utf8")
  const forms = readFileSync("src/lib/forms/actions.ts", "utf8")
  const events = readFileSync("src/lib/events/actions.ts", "utf8")
  const authRateLimit = readFileSync("src/lib/security/rate-limit.ts", "utf8")
  const authServer = readFileSync("src/lib/auth/server.ts", "utf8")
  const kidsPortal = readFileSync("src/lib/kids/portal-actions.ts", "utf8")
  const kidsActions = readFileSync("src/lib/kids/actions.ts", "utf8")
  const e2eScript = readFileSync("scripts/ensure-e2e-users.mjs", "utf8")
  const e2eAccounts = readFileSync("tests/e2e/helpers/accounts.ts", "utf8")
  const publicRateLimit = readFileSync("src/lib/security/public-rate-limit.ts", "utf8")
  assert.match(v2, /expectedCompanyId/)
  assert.match(v2, /assignment\.company_id = swap\.company_id/)
  assert.match(v2, /shift\.company_id = assignment\.company_id/)
  assert.match(forms, /consumePublicRateLimit/)
  assert.match(events, /event-checkin/)
  assert.match(authRateLimit, /AUTH_RATE_LIMIT_FAIL_OPEN/)
  assert.match(authRateLimit, /allowed: false/)
  assert.match(authServer, /p\.role in \('member', 'visitor', 'attendee'\)/)
  assert.match(kidsPortal, /Já existe um cadastro para este contato/)
  assert.match(kidsActions, /Criança não está vinculada à sessão autorizada/)
  assert.match(e2eScript, /url\.origin !== expectedUrl\.origin/)
  assert.match(e2eAccounts, /supabaseUrl\.origin !== expectedUrl\.origin/)
  assert.match(v2, /replacement\.company_id = \$\{companyId\}/)
  assert.match(v2, /membership\.company_id = volunteer\.company_id/)
  assert.match(publicRateLimit, /if \(!address\) return false/)
  assert.match(publicRateLimit, /x-vercel-forwarded-for/)
  assert.match(publicRateLimit, /PUBLIC_RATE_LIMIT_DISABLED/)
})

