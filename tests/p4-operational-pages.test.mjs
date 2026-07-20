import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const operationalPages = [
  "eventos",
  "presenca",
  "intercessao",
  "discipulado",
  "comunicacao",
  "notificacao",
  "crm",
  "doacao",
  "financeiro",
  "inpeace-play",
]

test("operational dashboard pages do not import mock data", () => {
  for (const page of operationalPages) {
    const source = readFileSync(`src/app/(dashboard)/${page}/page.tsx`, "utf8")
    assert(!source.includes("@/lib/mock/data"), `${page} still imports mock data`)
    assert(source.includes("@/lib/operational/data"), `${page} does not read persisted data`)
  }
})

test("events creation surfaces server action result to the user", () => {
  const page = readFileSync("src/app/(dashboard)/eventos/page.tsx", "utf8")
  const form = readFileSync("src/app/(dashboard)/eventos/event-create-form.tsx", "utf8")
  const actions = readFileSync("src/lib/operational/actions.ts", "utf8")

  assert.match(page, /EventCreateForm/)
  assert.match(form, /const result = await saveEvent\(formData\)/)
  assert.match(form, /toast\.error\(result\.error/)
  assert.match(form, /toast\.success\("Evento criado com sucesso"\)/)
  assert.match(form, /disabled=\{isPending\}/)
  assert.match(form, /Voluntariado — opcional/)
  assert.match(form, /<SelectItem value="none">Não aplicar modelo<\/SelectItem>/)
  assert.match(actions, /volunteerTemplateValue !== "none"/)
})
