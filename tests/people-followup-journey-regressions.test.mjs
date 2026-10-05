import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"
import ts from "typescript"

const require = createRequire(import.meta.url)
function load(path, mocks = {}) {
  const source = readFileSync(path, "utf8")
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)((name) => {
    if (name in mocks) return mocks[name]
    if (name.startsWith("@/")) return {}
    return require(name)
  }, loaded, loaded.exports)
  return loaded.exports
}
const auth = { getCurrentUser: async () => ({ id: "actor", companyId: "church" }), requireUserCompanyId: () => "church" }
function actions(sql) {
  return load("src/lib/people/actions.ts", {
    "@/lib/auth/server": auth,
    "@/lib/auth/permissions": { requirePermission: async () => {} },
    "@/lib/db/client": { getSql: () => sql },
    "next/cache": { revalidatePath: () => {} },
  })
}

test("follow-up configuration accepts today's deadline and rejects invalid days and assignees", () => {
  const { parseFollowUpConfig } = load("src/lib/people/follow-up-config.ts")
  assert.equal(parseFollowUpConfig({ dueDays: 0 }).dueDays, 0)
  for (const input of [{ dueDays: -1 }, { dueDays: 61 }, { dueDays: 1.5 }, { daysThreshold: 0 }, { daysThreshold: 181 }, { responsibleProfileId: "invalid" }, { priority: "invalid" }]) {
    assert.throws(() => parseFollowUpConfig(input), /Revise/)
  }
})

test("editing a step preserves its order when the form sends no new position", async () => {
  let position = 3
  const api = actions(async (strings, ...values) => {
    const query = strings.join("?")
    if (query.includes("select id from public.member_journeys")) return [{ id: "journey" }]
    if (query.includes("update public.member_journey_steps")) {
      assert.match(query, /sort_order = coalesce\(\?::integer, sort_order\)/)
      position = values[2] ?? position
      assert.match(query, /journey_id = \?/)
      return [{ id: "step" }]
    }
    throw new Error("Unexpected query")
  })
  const result = await api.saveJourneyStep({ id: "step", journeyId: "journey", name: "Nome atualizado", estimatedDays: 7 })
  assert.equal(result.ok, true)
  assert.equal(position, 3)
})

test("invalid suggested deadlines are rejected before writing a step", async () => {
  const api = actions(async () => { throw new Error("Must not reach database") })
  for (const estimatedDays of [0, -1, 1.5, 366]) {
    const result = await api.saveJourneyStep({ journeyId: "journey", name: "Etapa", estimatedDays })
    assert.equal(result.ok, false)
    assert.match(result.error, /entre 1 e 365/)
  }
})

test("empty or unavailable journeys cannot enroll a person", async () => {
  let inserts = 0
  const api = actions(async (strings) => {
    const query = strings.join("?")
    if (query.includes("insert into")) inserts++
    assert.match(query, /step\.is_active = true/)
    assert.match(query, /person\.company_id = journey\.company_id/)
    return []
  })
  const result = await api.enrollPersonInJourney({ personId: "person", journeyId: "journey" })
  assert.equal(result.ok, false)
  assert.equal(inserts, 0)
})

test("ending a journey keeps the enrollment to avoid resurrecting it from legacy progress", async () => {
  let updated = false
  const api = actions(async (strings) => {
    const query = strings.join("?")
    assert.match(query, /update public\.person_journey_enrollments/)
    assert.match(query, /status = 'dropped'/)
    assert.doesNotMatch(query, /delete from/)
    updated = true
    return [{ person_id: "person" }]
  })
  assert.equal((await api.unenrollPersonFromJourney("enrollment")).ok, true)
  assert.equal(updated, true)
})

test("follow-up processing skips handled candidates before the limit and preserves zero-day deadlines", async () => {
  const kinds = ["new_visitor", "visitor_without_contact", "without_cell", "without_portal_access", "new_prayer_request", "recurring_absence"]
  const candidateQueries = []
  const api = load("src/lib/people/follow-up.ts", {
    "./types": { isFollowUpPriority: (value) => ["low", "normal", "high", "urgent"].includes(value) },
    "@/lib/db/client": { getSql: () => async (strings, ...values) => {
      const query = strings.join("?")
      if (query.includes("select id, trigger_kind")) return kinds.map((trigger_kind) => ({ id: trigger_kind, trigger_kind, name: trigger_kind, config: { dueDays: 0 } }))
      if (query.includes("select distinct company_id")) return [{ company_id: "church" }]
      if (query.includes("existing_task")) {
        assert.ok(query.indexOf("existing_task.source_key") < query.indexOf("limit ?"))
        candidateQueries.push(query)
        return [{ person_id: "person", source_key: `${values[0]}:person` }]
      }
      if (query.includes("insert into public.person_follow_up_tasks")) {
        assert.equal(values.at(-1), 0)
        return [{ id: "task" }]
      }
      return []
    } },
  })
  const result = await api.processFollowUpTriggers("church", 100)
  assert.equal(result.created, 6)
  assert.equal(candidateQueries.length, 6)
  assert.match(candidateQueries[3], /person_type in \('member', 'leader', 'volunteer'\)/)
})

test("a person with no enrollment is not enrolled in every configured journey", async () => {
  for (const completed of [false, true]) {
    const api = load("src/lib/people/data.ts", {
      "@/lib/auth/server": auth,
      "@/lib/auth/permissions": { requirePermission: async () => {} },
      "@/lib/files/server": { createSignedUrlsByStoragePath: async () => new Map() },
      "./follow-up": { listPersonFollowUpTasks: async () => [], listPersonTimeline: async () => [] },
      "@/lib/db/client": { getSql: () => async (strings) => {
        const query = strings.join("?")
        if (query.includes("left join auth.users au") && query.includes("p.internal_notes")) return [{ id: "person", company_id: "church", full_name: "Pessoa", created_at: new Date(), updated_at: new Date() }]
        if (query.includes("from public.member_journey_steps mjs")) return [
          { journey_id: "journey", journey_name: "Integração", step_id: "one", step_name: "Acolhimento", completed_at: completed ? new Date() : null },
          { journey_id: "journey", journey_name: "Integração", step_id: "two", step_name: "Discipulado", completed_at: null },
          { journey_id: "unrelated", journey_name: "Outra trilha", step_id: "three", step_name: "Etapa", completed_at: null },
        ]
        return []
      } },
    })
    const person = await api.getPersonDetail("00000000-0000-4000-8000-000000000001")
    assert.equal(person.enrolledJourneys.length, completed ? 1 : 0)
    if (completed) assert.equal(person.enrolledJourneys[0].steps.length, 2)
  }
})
