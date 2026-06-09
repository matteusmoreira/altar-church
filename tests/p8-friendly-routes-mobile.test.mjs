import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

const friendlyRoutes = {
  "church-info": "informacoes",
  ministries: "ministerios",
  programming: "programacao",
  songs: "louvor",
  congregations: "congregacoes",
  members: "pessoas",
  visitors: "visitantes",
  groups: "gceus",
  cells: "celulas",
  prayer: "intercessao",
  "reading-plans": "discipulado",
  events: "eventos",
  content: "conteudo",
  notifications: "notificacao",
  communication: "comunicacao",
  attendance: "presenca",
  finance: "financeiro",
  donations: "doacao",
  reports: "relatorios",
  settings: "configuracoes",
}

test("friendly dashboard routes use one typed registry and real route folders", () => {
  const registry = read("src/lib/navigation/routes.ts")
  const layout = read("src/components/layout/dashboard-layout.tsx")
  const proxy = read("src/lib/supabase/proxy.ts")
  const nextConfig = read("next.config.ts")

  assert.match(layout, /dashboardRoutes/)
  assert.match(proxy, /protectedDashboardPrefixes/)
  assert.match(nextConfig, /legacyDashboardRedirects/)

  for (const [moduleId, slug] of Object.entries(friendlyRoutes)) {
    assert.match(registry, new RegExp(`["']?${moduleId}["']?:\\s*["']\\/${slug}["']`))
    assert.equal(existsSync(`src/app/(dashboard)/${slug}`), true, `missing /${slug} route folder`)
    assert.equal(existsSync(`src/app/(dashboard)/${moduleId}`), false, `legacy /${moduleId} route folder remains`)
  }
})

test("shared select and dashboard shell are mobile-first", () => {
  const select = read("src/components/ui/select.tsx")
  const button = read("src/components/ui/button.tsx")
  const input = read("src/components/ui/input.tsx")
  const tabs = read("src/components/ui/tabs.tsx")
  const dialog = read("src/components/ui/dialog.tsx")
  const layout = read("src/components/layout/dashboard-layout.tsx")

  assert.match(select, /w-full/)
  assert.match(select, /min-h-11/)
  assert.match(select, /align = "start"/)
  assert.match(select, /max-w-\[calc\(100vw-2rem\)\]/)
  assert.match(button, /min-h-11/)
  assert.match(input, /min-h-11/)
  assert.match(tabs, /min-h-11/)
  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/)
  assert.match(layout, /pb-\[calc\(5rem\+env\(safe-area-inset-bottom\)\)\]/)
})

