import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url))

test("P0 removes legacy SQLite and custom auth packages from production config", () => {
  const packageJson = read("package.json")
  const nextConfig = read("next.config.ts")

  assert.doesNotMatch(packageJson, /better-sqlite3/)
  assert.doesNotMatch(packageJson, /bcryptjs/)
  assert.doesNotMatch(packageJson, /jsonwebtoken/)
  assert.doesNotMatch(nextConfig, /serverExternalPackages/)
  assert.doesNotMatch(nextConfig, /better-sqlite3/)
})

test("P0 documents local setup, validation, deploy, rollback and secret handling", () => {
  const readme = read("README.md")

  for (const required of [
    /Altar Church/,
    /POSTGRES_URL/,
    /Supabase/,
    /npm run typecheck/,
    /npm run lint/,
    /npm run build/,
    /npm run test:e2e/,
    /deploy/i,
    /rollback/i,
    /restore/i,
    /rotacion/i,
  ]) {
    assert.match(readme, required)
  }
})

test("P0 provides CI gate with typecheck, lint, node tests, build, E2E and audit", () => {
  assert.ok(exists(".github/workflows/ci.yml"), "missing CI workflow")

  const ci = read(".github/workflows/ci.yml")

  for (const required of [
    /npm ci/,
    /npm run typecheck/,
    /npm run lint/,
    /node --test/,
    /npm run build/,
    /npm run e2e:setup/,
    /npm run test:e2e/,
    /npm audit --audit-level=moderate/,
  ]) {
    assert.match(ci, required)
  }
})

test("P0 E2E setup does not read loose plaintext secret files", () => {
  const setup = read("scripts/ensure-e2e-users.mjs")

  assert.doesNotMatch(setup, /Supabase\.txt/)
  assert.doesNotMatch(setup, /supabaseTextPath/)
  assert.match(setup, /SUPABASE_ACCESS_TOKEN/)
  assert.match(setup, /SUPABASE_SERVICE_ROLE_KEY/)
})

test("P0 E2E setup enables active modules for the test company", () => {
  const setup = read("scripts/ensure-e2e-users.mjs")

  assert.match(setup, /insert into public\.company_modules/)
  assert.match(setup, /from public\.system_modules/)
  assert.match(setup, /where active = true/)
  assert.match(setup, /set enabled = true/)
})

test("P1 adds reusable server-side dashboard route access guard", () => {
  const source = read("src/lib/auth/page-access.ts")

  assert.match(source, /export async function requireDashboardModuleAccess/)
  assert.match(source, /moduleId/)
  assert.match(source, /permission/)
  assert.match(source, /getCompanyEnabledModuleIds/)
  assert.match(source, /hasPermission\(user\.role, permission\)/)
  assert.match(source, /redirect\("\/dashboard\?access=module-inactive"\)/)
  assert.match(source, /redirect\("\/dashboard\?access=denied"\)/)
})

test("P1 operational dashboard routes use server-side module and permission layouts", () => {
  const guardedRoutes = {
    presenca: ["attendance", "attendance.view"],
    celulas: ["cells", null],
    informacoes: ["church-info", "settings.edit"],
    comunicacao: ["communication", "communication.view"],
    congregacoes: ["congregations", "members.view"],
    conteudo: ["content", "content.view"],
    crm: ["crm", "crm.view"],
    dashboard: ["dashboard", null],
    doacao: ["donations", "donation.view"],
    eventos: ["events", "events.view"],
    financeiro: ["finance", "finance.view"],
    "inpeace-play": ["inpeace-play", "subscription.view"],
    pessoas: ["members", "members.view"],
    ministerios: ["ministries", "ministries.view"],
    notificacao: ["notifications", "notification.view"],
    intercessao: ["prayer", "prayer.view"],
    programacao: ["programming", null],
    discipulado: ["reading-plans", null],
    relatorios: ["reports", "reports.view"],
    configuracoes: ["settings", "settings.manage_settings"],
    louvor: ["songs", null],
    visitantes: ["visitors", "visitors.view"],
  }

  for (const [route, [moduleId, permission]] of Object.entries(guardedRoutes)) {
    const layoutPath = `src/app/(dashboard)/${route}/layout.tsx`
    assert.ok(exists(layoutPath), `missing ${layoutPath}`)

    const source = read(layoutPath)
    assert.match(source, /requireDashboardModuleAccess/)
    assert.match(source, new RegExp(`moduleId: "${moduleId}"`))

    if (permission) {
      assert.match(source, new RegExp(`permission: "${permission}"`))
    }
  }
})
