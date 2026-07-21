import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")

test("acoes principais possuem medicao e trabalho derivado pos-resposta", async () => {
  const timing = await read("src/lib/performance/action-timing.ts")
  const people = await read("src/lib/people/actions.ts")
  const pastoral = await read("src/lib/pastoral/actions.ts")
  const volunteers = await read("src/lib/volunteers/actions.ts")

  assert.match(timing, /SLOW_ACTION_MS = 1_500/)
  assert.match(timing, /CRITICAL_ACTION_MS = 5_000/)
  assert.match(people, /withActionTiming\("people\.save"/)
  assert.match(people, /afterResponse\("people member count"/)
  assert.match(pastoral, /withActionTiming\("ministries\.save"/)
  assert.match(volunteers, /withActionTiming\("volunteers\.save"/)
  assert.match(volunteers, /from unnest\(/)
})

test("Pessoas evita N Server Actions e carrega duplicidades sob demanda", async () => {
  const page = await read("src/app/(dashboard)/pessoas/page.tsx")
  const client = await read("src/app/(dashboard)/pessoas/members-client.tsx")
  const actions = await read("src/app/(dashboard)/pessoas/actions.ts")

  assert.doesNotMatch(page, /listDuplicateCandidates/)
  assert.match(actions, /loadDuplicateCandidates/)
  assert.match(actions, /deletePeople/)
  assert.match(client, /Carregando duplicidades/)
  assert.match(client, /ids: peopleToDelete\.map/)
  assert.doesNotMatch(client, /for \(const person of peopleToDelete\)/)
})

test("fluxos prioritarios mostram pending e nao fazem refresh duplicado", async () => {
  const people = await read("src/app/(dashboard)/pessoas/members-client.tsx")
  const ministries = await read("src/app/(dashboard)/ministerios/ministries-client.tsx")
  const volunteers = await read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")

  assert.match(people, /disabled=\{isSaving\}/)
  assert.match(ministries, /disabled=\{isSaving\}/)
  assert.match(volunteers, /aria-busy=\{saving\}/)
  assert.match(volunteers, /Criando acesso\.\.\./)
  assert.doesNotMatch(people, /setFormData\(emptyForm\)\s+router\.refresh/)
  assert.doesNotMatch(ministries, /setFormData\(emptyForm\)\s+router\.refresh/)
  assert.doesNotMatch(volunteers, /resetForm\(\);\s+router\.refresh/)
})

test("worker de voluntarios separa idempotencia inicial e lembretes", async () => {
  const migration = await read("supabase/migrations/20260721010000_volunteer_delivery_idempotency.sql")
  assert.match(migration, /notification_key is null/)
  assert.match(migration, /notification_key_unique_idx/)
  assert.match(migration, /notification_key is not null/)
})
