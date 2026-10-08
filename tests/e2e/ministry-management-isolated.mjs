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
const output = resolve(root, "artifacts/ministry-management")
const fixture = {
  workspace: {
    profile: { id: "ministry-demo", companyId: "church-demo", name: "Ministério de Tecnologia", slug: "tecnologia", mission: "Responsável pela tecnologia e pelo acolhimento da igreja.", description: "Descrição de exemplo", ministryType: "administration", targetAudience: "Membros", contact: "", leaderPersonId: "person-1", leaderName: "Ana", meetingDay: 0, meetingTime: "19:00", meetingLocation: "Sala de reuniões", publicJoinEnabled: true, isActive: true },
    actorRole: "admin", canManage: true,
    indicators: { activeMembers: 2, pendingMembers: 1, inactiveMembers: 1, activeTeams: 1, openTeamSlots: 2, upcomingActivities: 1, attendancePresent30d: 0, attendanceAbsent30d: 0, incompleteScales: 1, openFollowUps: 0 },
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
  attendanceRecords: [], scales: [], resources: [], communications: [],
  report: { membersByStatus: [], membersByMonth: [], attendance: [], teamParticipation: [], volunteerHours: 0, filledScales: 0, openFollowUps: 0, completedFollowUps: 0, communication: [], retention: { activeAt30d: 0, currentActive: 0, rate: 0 } },
  people: [], leaderCandidates: [{ id: "person-1", fullName: "Ana Maria" }], responsibleCandidates: [],
}
fixture.people = fixture.members.map((member) => ({ id: member.personId, fullName: member.personName, email: member.email, phone: member.phone, membershipStatus: member.status, membershipRole: member.role }))
fixture.members[0].photoUrl = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#2454ab"/><text x="40" y="48" text-anchor="middle" fill="white" font-size="26">AM</text></svg>')
fixture.members[1].photoUrl = "/missing-photo.png"
fixture.members[2].photoUrl = null
fixture.members[3].photoUrl = null
fixture.people.push({ id: "person-5", fullName: "Elisa Nova", email: "elisa@example.invalid", phone: "", membershipStatus: null, membershipRole: null })


fixture.report.period = { from: "2026-09-09", to: "2026-10-08" };
fixture.report.timezone = "America/Sao_Paulo";
fixture.agenda[0].startsAt = new Date(Date.now()+86400000).toISOString();
fixture.scales = [{ eventId: "event-1", eventTitle: fixture.agenda[0].title, startsAt: fixture.agenda[0].startsAt, publishedAt: null, scheduleId: "schedule-1", scheduleStatus: "draft", status: "incomplete", positions: [{ id: "position-1", shiftId: "shift-1", roleName: "Som", requiredVolunteers: 3, assignedVolunteers: 0, missingVolunteers: 3, instructions: "Teste de som", assignments: [] }] }, { eventId: "event-2", eventTitle: "Encontro de destino", startsAt: new Date(Date.now()+2*86400000).toISOString(), publishedAt: null, scheduleId: null, scheduleStatus: null, status: "draft", positions: [] }];
const management = { timezone: "America/Sao_Paulo", attendance: [{ eventId: "event-history", title: "Encontro anterior", day: "2026-10-01", present: 2, absent: 1, justified: 1 }], responsibles: [{ id: "profile-leader", name: "Ana Maria" }], followUps: [{ id: "task-1", personId: "person-1", personName: "Ana Maria", title: "Contato de acolhimento", notes: "Conversa do ministério", nextAction: "Agendar conversa", responsibleProfileId: "profile-leader", responsibleName: "Ana Maria", dueAt: new Date(Date.now()-86400000).toISOString(), priority: "normal", status: "open" }] };
let browser
let server
try {
  await mkdir(output, { recursive: true })
  const source = await readFile(resolve(root, "src/components/ministries/ministry-workspace.tsx"), "utf8")
  const actionNames = source.match(/import \{ ([^}]+) \} from "@\/lib\/ministries\/actions"/)[1].split(",").map((name) => name.trim())
  await writeFile(resolve(directory, "actions.js"), `const invoke = async (name, input) => { window.mockCalls.push({ name, input }); if (window.mockFailure) return { ok: false, error: "Falha simulada: tente novamente" }; return { ok: true, id: "mock-id", data: [] }; };\n${actionNames.map((name) => `export const ${name} = (input) => invoke("${name}", input);`).join("\n")}`)
  await writeFile(resolve(directory, "automations-actions.js"), `export const uploadAutomationMedia = async () => ({ id: "mock-file", name: "imagem.png" });\nexport const automationMediaPreview = async () => "";`)
  await writeFile(resolve(directory, "management-actions.js"), `const management=${JSON.stringify(management)}; const invoke=(name,input)=>{window.mockCalls.push({name,input});return window.mockFailure ? {ok:false,error:"Falha simulada: tente novamente"} : {ok:true}}; export const loadMinistryManagement=async()=>window.mockFailure ? {ok:false,error:"Falha simulada: tente novamente"} : {ok:true,data:management}; export const loadMinistryPersonHistory=async()=>({ok:true,data:{assignments:[{id:"assignment-1",title:"Encontro anterior",startsAt:"2026-10-01T22:00:00Z",roleName:"Som",status:"confirmed"}],attendance:[{id:"attendance-1",title:"Encontro anterior",day:"2026-10-01",status:"present"}]}}); export const loadMinistryScaleSources=async()=>({ok:true,data:[{id:"event-history",title:"Escala anterior",startsAt:"2026-10-01T22:00:00Z"}]});export const copyMinistryScale=async input=>({...invoke("copyMinistryScale",input),data:{omitted:["Integrante inativo — Som"]}});export const saveMinistryFollowUp=async input=>{const result=invoke("saveMinistryFollowUp",input);if(result.ok){const index=management.followUps.findIndex(item=>item.id===input.id); const task={...input,id:input.id || "task-new",personName:"Ana Maria",responsibleName:"Ana Maria"};if(index>=0)management.followUps[index]=task;else management.followUps.push(task);}return result};export const loadMinistryReport=async(_id,period)=>({ok:true,data:{...${JSON.stringify(fixture.report)},period,volunteerHours:2,filledScales:1}});`)
  await writeFile(resolve(directory, "navigation.js"), `const router = { refresh() {}, push() {} }; export const useRouter = () => router;`)
  await writeFile(resolve(directory, "loader.cjs"), `const ts = require(${JSON.stringify(resolve(root, "node_modules/typescript"))}); module.exports = function(source) { return ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText; };`)
  await writeFile(resolve(directory, "entry.tsx"), `import React from "react"; import { createRoot } from "react-dom/client"; import { Toaster } from "sonner"; import { MinistryWorkspace } from ${JSON.stringify(resolve(root, "src/components/ministries/ministry-workspace.tsx"))}; window.mockCalls = []; window.mockFailure = false; const data = ${JSON.stringify(fixture)}; if (location.search.includes("empty")) { data.members = []; data.teams = []; data.agenda = []; } if (location.search.includes("readonly")) data.workspace.canManage = false; createRoot(document.getElementById("root")).render(<React.StrictMode><main className="mx-auto max-w-screen-2xl p-4 md:p-8"><MinistryWorkspace data={data} /><Toaster /></main></React.StrictMode>);`)
  await writeFile(resolve(directory, "ministry-chat.js"), "export const MinistryChat = () => null; export const MinistryChatBadge = () => null;")
  const compiler = vendor.webpack({ mode: "development", devtool: false, entry: resolve(directory, "entry.tsx"), output: { path: directory, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".js"], modules: [resolve(root, "node_modules")], alias: { "./ministry-chat": resolve(directory, "ministry-chat.js"), "@/lib/ministries/actions": resolve(directory, "actions.js"), "@/lib/ministries/management-actions": resolve(directory, "management-actions.js"), "@/lib/automations/actions": resolve(directory, "automations-actions.js"), "next/navigation": resolve(directory, "navigation.js"), "@": resolve(root, "src") } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: resolve(directory, "loader.cjs") }] } })
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
  for (const [name, viewport] of [["desktop",{width:1440,height:1000}],["mobile",{width:390,height:844}]]) {
    for(const theme of ["light","dark"]) {
      const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
      page.on("pageerror",error=>errors.push(error.message));await page.goto(url);
      await page.evaluate(theme=>document.documentElement.classList.toggle("dark",theme==="dark"),theme);
      await expect(page.getByText("Precisa da sua atenção",{exact:true})).toBeVisible();
      await expect(page.getByText(/Presença entre registros: 50%/)).toBeVisible();
      await page.screenshot({path:resolve(output,`${name}-${theme}-overview.png`),fullPage:true,animations:"disabled"});
      await page.getByRole("button",{name:"Adicionar pessoa",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click();
      await page.getByRole("tab",{name:"Visão geral",exact:true}).click();
      await page.getByRole("button",{name:"Completar escala",exact:true}).click();
      assert.ok(page.url().includes("event=event-1"));await page.reload();
      await expect(page.getByRole("tab",{name:"Escalas",exact:true})).toHaveAttribute("aria-selected","true");
      await page.getByRole("button",{name:"Copiar escala anterior",exact:true}).click();
      await page.getByLabel("Escala de origem").selectOption("event-history");await page.getByLabel("Atividade de destino").selectOption("event-2");
      await page.getByRole("button",{name:"Copiar para rascunho",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
      assert.ok(page.url().includes("event=event-2"));
      const copy=await page.evaluate(()=>window.mockCalls.find(call=>call.name==="copyMinistryScale"));assert.equal(copy.input.targetEventId,"event-2");
      await page.getByRole("tab",{name:"Agenda",exact:true}).click();await page.getByRole("button",{name:"Registrar presença",exact:true}).click();
      await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click();
      await page.getByRole("tab",{name:"Pessoas",exact:true}).click();await page.getByRole("button",{name:"Ver detalhes",exact:true}).first().click();
      await expect(page.getByRole("dialog").getByText("Som",{exact:false})).toBeVisible();await page.keyboard.press("Escape");
      await page.getByRole("tab",{name:"Acompanhamentos",exact:true}).click();
      await expect(page.getByText("Contato de acolhimento",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Iniciar",exact:true}).click();
      await expect(page.getByText("Em andamento",{exact:true}).last()).toBeVisible();await page.getByRole("button",{name:"Concluir",exact:true}).click();await expect(page.getByText("Concluído",{exact:true}).last()).toBeVisible();
      await page.getByRole("button",{name:"Reabrir",exact:true}).click();await page.getByRole("button",{name:"Novo acompanhamento",exact:true}).click();
      await page.getByLabel("Pessoa",{exact:true}).selectOption("person-1");await page.getByLabel("Título",{exact:true}).fill("Novo caso do ministério");await page.getByLabel("Próxima ação",{exact:true}).fill("Ligar para o integrante");await page.getByLabel("Prazo",{exact:true}).fill("2026-10-10T18:00");
      await page.getByRole("button",{name:"Salvar acompanhamento",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0);
      const saved=await page.evaluate(()=>window.mockCalls.findLast(call=>call.name==="saveMinistryFollowUp"));assert.equal(saved.input.dueAt,"2026-10-10T21:00:00.000Z");
      await page.getByRole("tab",{name:"Relatórios",exact:true}).click();await page.getByLabel("Período",{exact:true}).selectOption("90");await expect(page.getByRole("button",{name:"CSV",exact:true})).toBeEnabled();
      await page.getByLabel("De",{exact:true}).fill("2026-10-01");await page.getByLabel("Até",{exact:true}).fill("2026-10-08");
      await expect(page.getByRole("button",{name:"CSV",exact:true})).toHaveAttribute("href",/from=2026-10-01&to=2026-10-08/);
      for(const tab of ["Visão geral","Pessoas","Equipes","Agenda","Escalas","Acompanhamentos","Comunicação","Recursos","Relatórios","Configurações"]) {
        await page.getByRole("tab",{name:tab,exact:true}).click();await expect(page.getByRole("tabpanel")).toBeVisible();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}/${theme}/${tab}: overflow`);
      }
      await page.getByRole("tab",{name:"Pessoas",exact:true}).focus();await page.keyboard.press("ArrowRight");await expect(page.getByRole("tab",{name:"Equipes",exact:true})).toHaveAttribute("aria-selected","true");
      await page.goto(url+"?readonly");await expect(page.getByRole("tab",{name:"Acompanhamentos",exact:true})).toHaveCount(0);
      await page.getByRole("tab",{name:"Pessoas",exact:true}).click();await expect(page.getByRole("button",{name:"Ver detalhes",exact:true})).toHaveCount(0);
      assert.deepEqual(errors,[],`${name}/${theme}: browser errors`);console.log(`${name}/${theme}: overview, navigation, scale copy, people, follow-ups, reports, keyboard and permissions passed`);await context.close();
    }
  }
} finally {
  await browser?.close();if(server) await new Promise(accept=>server.close(accept));
  assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith("ministry-layout-"));await rm(directory,{recursive:true,force:true});
}
