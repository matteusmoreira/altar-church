import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"
import { parseMoney } from "../src/lib/operational/money.ts"
import { objectToFormData } from "../src/lib/api/form-data.ts"
import { isProtectedDashboardPath } from "../src/lib/navigation/routes.ts"

const realRequire = createRequire(import.meta.url)
const user = { id: "11111111-1111-4111-8111-111111111111", churchId: "22222222-2222-4222-8222-222222222222", role: "admin" }
function load(path, overrides = {}) {
  const mocks = {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/permissions": { requirePermission: async () => user, writeAuditLog: async () => {} },
    "@/lib/auth/server": { getCurrentUser: async () => user, requireUserCompanyId: () => user.churchId },
    "@/lib/performance/after-response": {},
    "@/lib/files/server": { getOptionalFile: () => null, createSignedUrlsByStoragePath: async () => new Map() },
    "@/lib/notifications/campaign": {}, "./money": { parseMoney }, "./follow-up": {}, "./follow-up-config": {},
    ...overrides,
  }
  const mod = { exports: {} }
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (name) => name in mocks ? mocks[name] : name.startsWith("@/") ? {} : realRequire(name), FormData, File, Blob, Date, Error, console, window: overrides.__window })
  return mod.exports
}
function ledger({ uploadFails = false, auditFails = false, insertFails = false } = {}) {
  let records = new Map()
  const uploads = [], removed = []
  const sql = async (strings, ...values) => {
    if (typeof strings === "string") return strings
    const query = strings.reduce((text, part, index) => text + part + (index < values.length ? String(values[index]) : ""), "")
    if (query.includes("insert into public.audit_logs")) { if (auditFails) throw new Error("Audit failure"); return [] }
    if (query.includes("select id from public.")) return records.has(values[1]) ? [{ id: values[1] }] : []
    if (query.includes("insert into public.")) {
      if (insertFails) throw new Error("Insert failure")
      const id = values[0]
      if (records.has(id)) return []
      records.set(id, { id, receiptFileId: values[1], amount: values[query.includes("public.donations") ? 4 : 3] })
      return [{ id }]
    }
    throw new Error("Unexpected query")
  }
  sql.begin = async (callback) => {
    const before = new Map(records)
    try { return await callback(sql) } catch (error) { records = before; throw error }
  }
  const files = {
    getOptionalFile: (data) => data.get("receiptFile") instanceof File ? data.get("receiptFile") : null,
    uploadManagedFile: async () => { if (uploadFails) throw new Error("Tipo de arquivo inválido"); const file = { id: "33333333-3333-4333-8333-333333333333" }; uploads.push(file); return file },
    deleteManagedFile: async (id) => removed.push(id),
  }
  return { sql, files, uploads, removed, records: () => [...records.values()] }
}
function financeData(receipt = false) {
  const data = objectToFormData({ requestId: "44444444-4444-4444-8444-444444444444", amount: "10.50", description: "Regression", paymentDate: "2026-10-05", date: "2026-10-05" })
  if (receipt) data.set("receiptFile", new File(["receipt"], "receipt.pdf", { type: "application/pdf" }))
  return data
}
test("centavos canônicos, brasileiros e valores inválidos", () => {
  for (const [input, expected] of [["10.50", 10.5], ["0.01", 0.01], ["100.99", 100.99], ["1050", 1050], ["1.234,56", 1234.56], ["10,50", 10.5], [10.5, 10.5]]) assert.equal(parseMoney(input), expected)
  for (const input of ["", "abc", "1.2.3", "12,34,56", "1e3", "10.555", Infinity]) assert.ok(Number.isNaN(parseMoney(input)))
})
for (const method of ["saveRevenue", "saveExpense", "saveDonation"]) {
  test(`${method}: centavos e repetição da mesma operação`, async () => {
    const db = ledger()
    const actions = load("src/lib/operational/actions.ts", { "@/lib/db/client": { getSql: () => db.sql }, "@/lib/files/server": db.files })
    const data = financeData()
    const first = await actions[method](data), second = await actions[method](data)
    assert.equal(first.ok, true); assert.equal(second.id, first.id)
    assert.equal(db.records().length, 1); assert.equal(db.records()[0].amount, 10.5)
  })
  test(`${method}: erro de upload não cria lançamento`, async () => {
    const db = ledger({ uploadFails: true })
    const actions = load("src/lib/operational/actions.ts", { "@/lib/db/client": { getSql: () => db.sql }, "@/lib/files/server": db.files })
    assert.equal((await actions[method](financeData(true))).ok, false)
    assert.equal(db.records().length, 0)
  })
}
for (const failure of ["auditFails", "insertFails"]) {
  test(`falha ${failure} desfaz gravação e limpa comprovante preparado`, async () => {
    const db = ledger({ [failure]: true })
    const actions = load("src/lib/operational/actions.ts", { "@/lib/db/client": { getSql: () => db.sql }, "@/lib/files/server": db.files })
    assert.equal((await actions.saveRevenue(financeData(true))).ok, false)
    assert.equal(db.records().length, 0); assert.equal(db.uploads.length, 1); assert.equal(db.removed.length, 1)
  })
}
test("listas da API preservam itens e objetos mantêm JSON", () => {
  const form = objectToFormData({ recurrenceWeekdays: [0, 3], objectives: ["a", "b"], audiencePersonIds: [user.id], config: { active: true }, arbitraryJson: [1, 2] })
  assert.deepEqual(form.getAll("recurrenceWeekdays").map(Number), [0, 3])
  assert.deepEqual(form.getAll("objectives"), ["a", "b"])
  assert.equal(form.get("config"), '{"active":true}'); assert.equal(form.get("arbitraryJson"), "[1,2]")
})
test("exceções públicas não liberam rotas administrativas adjacentes", () => {
  const token = "44444444-4444-4444-8444-444444444444"
  for (const path of [`/kids/cadastro/church`, `/eventos/publico/${token}`, `/eventos/inscricao/${token}`, `/eventos/check-in/${token}`, `/eventos/check-in/sessao/${token}`]) assert.equal(isProtectedDashboardPath(path), false)
  for (const path of ["/kids", "/kids/recepcao", "/eventos", "/eventos/other", `/eventos/publico/${token}/edit`, "/membro", "/admin"]) assert.equal(isProtectedDashboardPath(path), true)
})
test("follow-up rejeita responsável externo, inativo e excluído antes do update", async () => {
  const queries = []
  const actions = load("src/lib/people/follow-up-actions.ts", { "@/lib/db/client": { getSql: () => async (strings) => { queries.push(strings.join("?")); return [] } } })
  const result = await actions.updatePersonFollowUpTask(objectToFormData({ taskId: "44444444-4444-4444-8444-444444444444", status: "open", responsibleProfileId: "55555555-5555-4555-8555-555555555555" }))
  assert.equal(result.ok, false); assert.match(result.error, /Responsável inválido/)
  assert.equal(queries.length, 1); assert.match(queries[0], /company_id/); assert.match(queries[0], /active = true and deleted_at is null/)
})
test("API-key pode ler a igreja já autorizada; leitura de tela ainda exige sessão", async () => {
  const actions = load("src/lib/people/data.ts", {
    "@/lib/auth/server": { getCurrentUser: async () => null },
    "@/lib/db/client": { getSql: () => async (strings) => strings.join("").includes("count(*)") ? [{ total: 0 }] : [] },
  })
  await assert.rejects(() => actions.listPeople({ companyId: user.churchId }), /Acesso negado/)
  const data = await actions.listPeopleForCompany(user.churchId)
  assert.equal(data.total, 0); assert.equal(data.people.length, 0)
})


test("prévia do voluntariado retorna candidatos fictícios e bloqueia mutações", async () => {
  const actions = load("src/lib/volunteers/client-actions.ts", {
    __window: { location: { pathname: "/dev/voluntariado" } },
    "./preview-data": { volunteerPreviewData: () => ({ manager: { volunteers: [{ id: "demo", name: "Ana fictícia" }] } }) },
  })
  const candidates = await actions.getVolunteerShiftCandidates("demo-shift")
  assert.equal(candidates.ok, true)
  assert.equal(candidates.data[0].volunteerName, "Ana fictícia")
  const mutation = await actions.saveVolunteerAssignment({ shiftId: "demo-shift" })
  assert.equal(mutation.ok, false)
  assert.match(mutation.error, /desabilitados/)
})
