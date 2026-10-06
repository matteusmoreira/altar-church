// Run with Node 24: node tests/e2e/ministry-layout-isolated.mjs
// Bundles the real UI with fictional data and mocked actions; no database or providers.
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, dirname, basename } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(resolve(root, "package.json"))
const { chromium, expect } = require("@playwright/test")
const vendor = require("next/dist/compiled/webpack/webpack")
const directory = await mkdtemp(resolve(tmpdir(), "ministry-layout-"))
const output = resolve(root, "test-results/ministry-layout")
const fixture = {
  workspace: {
    profile: { id: "ministry-demo", companyId: "church-demo", name: "Ministério de Tecnologia", slug: "tecnologia", mission: "Responsável pela tecnologia e pelo acolhimento da igreja.", description: "Descrição de exemplo", ministryType: "administration", targetAudience: "Membros", contact: "", leaderPersonId: "person-1", leaderName: "Ana", meetingDay: 0, meetingTime: "19:00", meetingLocation: "Sala de reuniões", publicJoinEnabled: true, isActive: true },
    actorRole: "admin", canManage: true,
    indicators: { activeMembers: 2, pendingMembers: 1, inactiveMembers: 1, activeTeams: 1, openTeamSlots: 2, upcomingActivities: 1, attendancePresent30d: 0, attendanceAbsent30d: 0, incompleteScales: 1, openFollowUps: 0, overdueFollowUps: 0 },
    activities: [], attendance: [], alerts: [], lastCommunication: null,
  },
  members: [
    { id: "member-1", personId: "person-1", personName: "Ana Maria", email: "ana@example.invalid", phone: "(11) 90000-0001", role: "leader", status: "active", teamNames: ["Equipe de tecnologia"], hasPortal: true },
    { id: "member-2", personId: "person-2", personName: "Bruno com sobrenome longo para conferir a quebra de linha no celular", email: "contato-com-endereco-extenso-para-validar-responsividade@example.invalid", phone: "(11) 90000-0002", role: "member", status: "pending", teamNames: [], hasPortal: false },
    { id: "member-3", personId: "person-3", personName: "Carla Silva", email: "carla@example.invalid", phone: "", role: "member", status: "inactive", teamNames: [], hasPortal: false },
    { id: "member-4", personId: "person-4", personName: "Daniel Souza", email: "daniel@example.invalid", phone: "", role: "member", status: "active", teamNames: [], hasPortal: false },
  ],
  teams: [{ id: "team-1", name: "Equipe de tecnologia com nome extenso para conferir o layout", description: "Equipe de exemplo", leaderPersonId: "person-1", leaderName: "Ana", coLeaderPersonId: null, coLeaderName: null, coordinatorPersonId: null, coordinatorName: null, meetingDay: "Domingo", meetingTime: "19:00", meetingLocation: "Sala", maxCapacity: 4, memberCount: 2, openSlots: 2, isActive: true }],
  teamMembers: [],
  agenda: [{ id: "event-1", programmingId: "activity-1", title: "Reunião da equipe de tecnologia com título longo para conferir o celular", description: "Atividade fictícia", programmingStartsAt: "2026-10-10T22:00:00Z", startsAt: "2026-10-10T22:00:00Z", endsAt: null, durationMinutes: 60, recurrenceFrequency: "none", recurrenceWeekdays: [], location: "Sala", status: "scheduled", recurring: false, attendanceCount: 0, volunteerPositions: 0, assignedVolunteers: 0, scaleComplete: false }],
  attendanceRecords: [], scales: [], followUps: [], onboarding: [], resources: [], communications: [],
  onboardingTemplates: [{ id: "template-1", name: "Integração na equipe", description: "Recepção dos membros", isActive: true, steps: [{ id: "step-1", title: "Conhecer a equipe", description: "Primeira reunião", sortOrder: 0, isRequired: true }] }],
  report: { membersByStatus: [], membersByMonth: [], attendance: [], teamParticipation: [], volunteerHours: 0, filledScales: 0, openFollowUps: 0, completedFollowUps: 0, communication: [], retention: { activeAt30d: 0, currentActive: 0, rate: 0 } },
  people: [], leaderCandidates: [{ id: "person-1", fullName: "Ana Maria" }], responsibleCandidates: [],
}
fixture.people = fixture.members.map((member) => ({ id: member.personId, fullName: member.personName, email: member.email, phone: member.phone, membershipStatus: member.status, membershipRole: member.role }))
fixture.people.push({ id: "person-5", fullName: "Elisa Nova", email: "elisa@example.invalid", phone: "", membershipStatus: null, membershipRole: null })

let browser
let server
try {
  await mkdir(output, { recursive: true })
  const source = await readFile(resolve(root, "src/components/ministries/ministry-workspace.tsx"), "utf8")
  const actionNames = source.match(/import \{ ([^}]+) \} from "@\/lib\/ministries\/actions"/)[1].split(",").map((name) => name.trim())
  await writeFile(resolve(directory, "actions.js"), `const invoke = async (name, input) => { window.mockCalls.push({ name, input }); if (window.mockFailure) return { ok: false, error: "Falha simulada: tente novamente" }; return { ok: true, id: "mock-id", data: [] }; };\n${actionNames.map((name) => `export const ${name} = (input) => invoke("${name}", input);`).join("\n")}`)
  await writeFile(resolve(directory, "navigation.js"), `const router = { refresh() {}, push() {} }; export const useRouter = () => router;`)
  await writeFile(resolve(directory, "loader.cjs"), `const ts = require(${JSON.stringify(resolve(root, "node_modules/typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText; };`)
  await writeFile(resolve(directory, "entry.tsx"), `import React from "react"; import { createRoot } from "react-dom/client"; import { Toaster } from "sonner"; import { MinistryWorkspace } from ${JSON.stringify(resolve(root, "src/components/ministries/ministry-workspace.tsx"))}; window.mockCalls = []; window.mockFailure = false; const data = ${JSON.stringify(fixture)}; if (location.search.includes("empty")) { data.members = []; data.teams = []; data.agenda = []; data.onboardingTemplates = []; } if (location.search.includes("readonly")) data.workspace.canManage = false; createRoot(document.getElementById("root")).render(<React.StrictMode><main className="mx-auto max-w-screen-2xl p-4 md:p-8"><MinistryWorkspace data={data} /><Toaster /></main></React.StrictMode>);`)
  const compiler = vendor.webpack({ mode: "development", devtool: false, entry: resolve(directory, "entry.tsx"), output: { path: directory, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], modules: [resolve(root, "node_modules")], alias: { "@/lib/ministries/actions": resolve(directory, "actions.js"), "next/navigation": resolve(directory, "navigation.js"), "@": resolve(root, "src") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: resolve(directory, "loader.cjs") }] } })
  await new Promise((accept, reject) => compiler.run((error, stats) => { if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true }))); else accept() }))
  await new Promise((accept, reject) => compiler.close((error) => error ? reject(error) : accept()))
  const postcss = require("postcss")
  const css = await postcss([require("@tailwindcss/postcss")({ base: root })]).process(await readFile(resolve(root, "src/app/globals.css"), "utf8"), { from: resolve(root, "src/app/globals.css") })
  await writeFile(resolve(directory, "style.css"), css.css)
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'
  server = createServer(async (request, response) => { const file = request.url.split("?")[0]; if (file === "/bundle.js" || file === "/style.css") { response.setHeader("Content-Type", file.endsWith(".js") ? "text/javascript" : "text/css"); response.end(await readFile(resolve(directory, file.slice(1)))) } else response.end(html) })
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept))
  const url = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  for (const [name, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser error:", error.message) })
    await page.goto(url)
    await expect(page.getByRole("heading", { name: "Ministério de Tecnologia" })).toBeVisible()
    await page.getByRole("tab", { name: "Visão geral", exact: true }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByRole("tab", { name: "Pessoas", exact: true })).toHaveAttribute("aria-selected", "true")
    const tabs = ["Visão geral", "Pessoas", "Equipes", "Agenda", "Escalas", "Comunicação", "Acompanhamentos", "Integração", "Recursos", "Relatórios", "Configurações"]
    for (const tab of tabs) {
      await page.getByRole("tab", { name: tab, exact: true }).click()
      await expect(page.getByRole("tabpanel")).toBeVisible()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}/${tab}: page overflows`)
      const columns = await page.getByRole("tabpanel").locator(":scope > .grid.grid-cols-1").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length))
      assert.ok(columns.every((count) => count === 1), `${name}/${tab}: main panels are not stacked`)
    }
    await page.getByRole("tab", { name: "Pessoas", exact: true }).click()
    await expect(page.locator("[data-people-view=list]")).toBeVisible()
    await page.getByRole("button", { name: "Grade", exact: true }).click()
    await expect(page.locator("[data-people-view=grid]")).toBeVisible()
    const gridCount = await page.locator("[data-people-view=grid]").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)
    assert.equal(gridCount, name === "desktop" ? 3 : 1)
    await page.screenshot({ path: resolve(output, `${name}-people.png`), fullPage: true })
    await page.reload()
    await page.getByRole("tab", { name: "Pessoas", exact: true }).click()
    await expect(page.getByRole("button", { name: "Grade", exact: true })).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("textbox", { name: "Buscar membros" }).fill("Ana")
    await expect(page.getByRole("status")).toHaveText("1 de 4 pessoas")
    await page.getByRole("combobox", { name: "Situação dos membros" }).click()
    await page.getByRole("option", { name: "Pendente", exact: true }).click()
    await expect(page.getByText("Nenhuma pessoa encontrada", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click()
    await expect(page.getByRole("status")).toHaveText("4 de 4 pessoas")
    await page.getByRole("textbox", { name: "Buscar membros" }).fill("Ana")
    const opener = page.getByRole("button", { name: "Adicionar pessoa", exact: true })
    await opener.click()
    await page.getByRole("textbox", { name: "Buscar pessoa", exact: true }).fill("Elisa")
    await page.getByRole("combobox", { name: "Pessoa cadastrada", exact: true }).click()
    await page.getByRole("option", { name: "Elisa Nova", exact: true }).click()
    await page.evaluate(() => { window.mockFailure = true })
    await page.getByRole("dialog").getByRole("button", { name: "Adicionar pessoa", exact: true }).click()
    await expect(page.getByText("Falha simulada: tente novamente")).toBeVisible()
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Buscar pessoa", exact: true })).toHaveValue("Elisa")
    await page.evaluate(() => { window.mockFailure = false })
    await page.getByRole("dialog").getByRole("button", { name: "Adicionar pessoa", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Buscar membros" })).toHaveValue("Ana")
    await page.getByRole("textbox", { name: "Buscar membros" }).fill("")
    for (const view of ["Lista", "Grade"]) {
      await page.getByRole("button", { name: view, exact: true }).click()
      await expect(page.getByRole("button", { name: "Aprovar", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Rejeitar", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Reativar", exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Remover", exact: true }).first().click()
      await expect(page.getByRole("alertdialog")).toBeVisible()
      await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar", exact: true }).click()
    }
    const dialogs = [["Equipes", "Criar equipe"], ["Equipes", "Adicionar à equipe"], ["Agenda", "Nova atividade"], ["Escalas", "Criar escala"], ["Escalas", "Registrar presença"], ["Comunicação", "Nova comunicação"], ["Acompanhamentos", "Novo acompanhamento"], ["Integração", "Criar checklist"], ["Integração", "Atualizar etapa"], ["Recursos", "Novo recurso"]]
    for (const [tab, action] of dialogs) {
      await page.getByRole("tab", { name: tab, exact: true }).click()
      await page.getByRole("button", { name: action, exact: true }).first().click()
      const modal = page.getByRole("dialog")
      await expect(modal).toBeVisible()
      assert.equal(await modal.evaluate((element) => element.scrollWidth > element.clientWidth), false, `${name}/${action}: dialog overflows`)
      await modal.getByRole("button", { name: "Cancelar", exact: true }).click()
      await expect(modal).toHaveCount(0)
      await expect(page.getByRole("button", { name: action, exact: true }).first()).toBeFocused()
    }
    await page.getByRole("tab", { name: "Equipes", exact: true }).click()
    await page.getByRole("button", { name: "Editar", exact: true }).click()
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Editar equipe" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Nome da equipe" })).toHaveValue(fixture.teams[0].name)
    await page.keyboard.press("Escape")
    await page.getByRole("tab", { name: "Agenda", exact: true }).click()
    await page.getByRole("button", { name: `Editar atividade ${fixture.agenda[0].title}`, exact: true }).click()
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Editar atividade" })).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("tab", { name: "Integração", exact: true }).click()
    await page.getByRole("button", { name: "Editar checklist", exact: true }).click()
    await expect(page.getByRole("textbox", { name: "Nome do checklist" })).toHaveValue("Integração na equipe")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Editar etapa Conhecer a equipe", exact: true }).click()
    await expect(page.getByRole("textbox", { name: "Título", exact: true })).toHaveValue("Conhecer a equipe")
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Adicionar etapa", exact: true }).click()
    await page.getByRole("textbox", { name: "Título", exact: true }).fill("Boas-vindas")
    await page.getByRole("button", { name: "Salvar etapa", exact: true }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.goto(url + "?empty")
    await page.getByRole("tab", { name: "Pessoas", exact: true }).click()
    await expect(page.getByText("Seu ministério ainda não tem membros")).toBeVisible()
    await page.goto(url + "?readonly")
    await page.getByRole("tab", { name: "Pessoas", exact: true }).click()
    await expect(page.getByRole("button", { name: "Adicionar pessoa", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Aprovar", exact: true })).toHaveCount(0)
    await page.getByRole("tab", { name: "Integração", exact: true }).click()
    await expect(page.getByRole("button", { name: "Atualizar etapa", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Criar checklist", exact: true })).toHaveCount(0)
    assert.deepEqual(errors, [], `${name}: browser errors`)
    console.log(`${name}: 11 tabs, responsive layout, list/grid, filters, dialogs, mocked success/error, editing and permissions passed`)
    await context.close()
  }
} finally {
  await browser?.close()
  if (server) await new Promise((accept) => server.close(accept))
  assert.equal(dirname(directory), resolve(tmpdir()))
  assert.ok(basename(directory).startsWith("ministry-layout-"))
  await rm(directory, { recursive: true, force: true })
}
