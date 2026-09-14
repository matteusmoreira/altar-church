import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import ts from "typescript"

const require = createRequire(import.meta.url)
const input = { churchSlug: "test", cellId: "00000000-0000-4000-8000-000000000001", fullName: "Visitante Teste", phone: "(11) 99999-9999", notes: "Gostaria de visitar" }
const source = readFileSync("src/app/api/v1/public/cells/visit-lead/route.ts", "utf8")

function harness({ failTask = false, visible = false, unavailable = false } = {}) {
  const writes = []
  let committed = false
  let rolledBack = false
  const sql = async (strings, ...values) => {
    const query = strings.join("?")
    if (query.includes("from public.companies")) return [{ id: "church", name: "Test" }]
    if (query.includes("from public.groups")) {
      assert.match(query, /g\.is_active = true/)
      assert.match(query, /g\.accepts_requests = true/)
      assert.match(query, /case when g\.is_leader_whatsapp_public then leader\.phone else null end/)
      return unavailable ? [] : [{ id: input.cellId, name: "Test", leader_name: "Líder", leader_phone: visible ? "11988888888" : null }]
    }
    if (query.includes("select id from public.people")) return []
    if (query.includes("from public.crm_stages")) return [{ id: "stage" }]
    if (query.includes("insert into")) writes.push({ query, values })
    if (query.includes("insert into public.people")) {
      assert.ok(!values.includes(null), "Optional neighborhood must be stored as empty text, not null")
      return [{ id: "person" }]
    }
    if (query.includes("insert into public.crm_cards")) return [{ id: "card" }]
    if (query.includes("insert into public.person_follow_up_tasks")) {
      const schema = readFileSync("supabase/migrations/20260731150000_person_360_follow_up.sql", "utf8")
      const allowed = schema.match(/status in \(([^)]+)\)/)[1]
      const status = query.match(/'([^']+)',\s*'without_cell'/)[1]
      assert.ok(allowed.includes(`'${status}'`), `Invalid follow-up status: ${status}`)
      assert.ok(values.includes("card"))
      assert.ok(values.some((value) => typeof value === "string" && value.includes(input.notes)))
      if (failTask) throw new Error("private database constraint detail")
    }
    return []
  }
  const db = { begin: async (callback) => {
    try { const result = await callback(sql); committed = true; return result }
    catch (error) { rolledBack = true; writes.length = 0; throw error }
  } }
  const loaded = { exports: {} }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function("require", "module", "exports", js)((name) => name === "@/lib/db/client" ? { getSql: () => db } : require(name), loaded, loaded.exports)
  return {
    submit: (body = input) => loaded.exports.POST(new Request("http://localhost/api/v1/public/cells/visit-lead", { method: "POST", body: JSON.stringify(body) })),
    writes,
    state: () => ({ committed, rolledBack }),
  }
}

test("visit creates person, CRM, valid follow-up and acquisition in one transaction", async () => {
  const h = harness()
  const response = await h.submit()
  assert.equal(response.status, 200)
  assert.equal(h.writes.length, 4)
  assert.deepEqual(h.state(), { committed: true, rolledBack: false })
  assert.equal((await response.json()).leaderPhone, null)
})

test("visible WhatsApp is returned after success", async () => {
  const response = await harness({ visible: true }).submit()
  assert.equal((await response.json()).leaderPhone, "11988888888")
})

test("failure rolls back the transaction and does not disclose database errors", async () => {
  const h = harness({ failTask: true })
  const response = await h.submit()
  assert.equal(response.status, 500)
  assert.equal(h.writes.length, 0)
  assert.deepEqual(h.state(), { committed: false, rolledBack: true })
  assert.doesNotMatch(await response.text(), /constraint|database|person_follow_up/)
})

test("invalid WhatsApp is rejected before database writes", async () => {
  const h = harness()
  assert.equal((await h.submit({ ...input, phone: "abcdefghij" })).status, 400)
  assert.equal(h.writes.length, 0)
  assert.equal(h.state().committed, false)
})

test("unavailable cell does not create a visitor", async () => {
  const h = harness({ unavailable: true })
  assert.equal((await h.submit()).status, 404)
  assert.equal(h.writes.length, 0)
})
