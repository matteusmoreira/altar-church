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

test("archived journeys and rules refuse mutations without touching the database", async () => {
 const api=actions(async()=>{throw new Error("Archived APIs must not query")})
 for(const [fn,arg] of [["saveJourneyStep",{}],["enrollPersonInJourney",{}],["unenrollPersonFromJourney","id"],["updateMemberJourney",{}],["toggleStepProgress",{}]]){
  const result=await api[fn](arg);assert.equal(result.ok,false);assert.match(result.error,/arquivad/i)
 }
 const follow=load("src/lib/people/follow-up.ts",{"./types":{},"@/lib/db/client":{getSql:()=>{throw new Error("Old rules must not query")}}})
 assert.deepEqual(await follow.processFollowUpTriggers("church",100),{triggers:0,created:0})
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
