import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync(
  "supabase/migrations/20260714140000_forms_and_crm_stages.sql",
  "utf8",
)

test("forms and crm stages migration creates core tables", () => {
  for (const table of ["crm_stages", "forms", "form_fields", "form_submissions"]) {
    assert(
      migration.includes(`create table if not exists public.${table}`),
      `missing table ${table}`,
    )
  }
})

test("crm cards migrate from fixed stage text to stage_id", () => {
  assert(migration.includes("add column if not exists stage_id"))
  assert(migration.includes("drop column if exists stage"))
  assert(migration.includes("drop constraint if exists crm_cards_stage_check"))
})

test("forms module is registered and linked to plans", () => {
  assert(migration.includes("'forms'"))
  assert(migration.includes("'/formularios'"))
  assert(migration.includes("forms.view"))
  assert(migration.includes("premium"))
  assert(migration.includes("enterprise"))
})

test("form slug and field key formats are constrained", () => {
  assert(migration.includes("forms_slug_format"))
  assert(migration.includes("form_fields_key_format"))
  assert(migration.includes("crm_stages_key_format"))
})

test("dashboard route and permissions include forms", () => {
  const routes = readFileSync("src/lib/navigation/routes.ts", "utf8")
  const types = readFileSync("src/lib/types.ts", "utf8")
  assert(routes.includes('"forms": "/formularios"'))
  assert(types.includes('"forms.view"'))
  assert(types.includes('"forms.create"'))
  assert(types.includes('"forms.edit"'))
  assert(types.includes('"forms.delete"'))
  assert(types.includes("stageId"))
})

test("form defaults and builder expose automation variables", () => {
  const actions = readFileSync("src/lib/forms/actions.ts", "utf8")
  const builder = readFileSync(
    "src/app/(dashboard)/formularios/[id]/form-builder-client.tsx",
    "utf8",
  )
  // form novo: variável {{nome}} (não nome_completo)
  assert(actions.includes('fieldKey: "nome"'))
  assert(!actions.includes('fieldKey: "nome_completo"'))
  assert(builder.includes("Variável da automação"))
  assert(builder.includes("Variáveis para automação"))
  assert(builder.includes("suggestVariableFromLabel"))
  assert(builder.includes("formatAutomationVar"))
})

test("crm board supports card drag-and-drop, quick move, whatsapp and search", () => {
  const actions = readFileSync("src/lib/operational/actions.ts", "utf8")
  const crmClient = readFileSync("src/app/(dashboard)/crm/crm-client.tsx", "utf8")

  assert(actions.includes("export async function moveCrmCardStage"), "missing moveCrmCardStage action")
  assert(actions.includes("moveCrmCardSchema"), "missing moveCrmCardSchema validation")
  assert(actions.includes('audit("crm_card.move"'), "move action must record audit log")

  assert(crmClient.includes("moveCrmCardStage"), "CRM client must call moveCrmCardStage")
  assert(crmClient.includes("draggable"), "cards must be draggable")
  assert(crmClient.includes("handleDragStart"), "missing handleDragStart")
  assert(crmClient.includes("handleDrop"), "missing handleDrop")
  assert(crmClient.includes("handleDragOver"), "missing handleDragOver")
  assert(crmClient.includes("handleMoveCard"), "missing handleMoveCard")
  assert(crmClient.includes("wa.me"), "missing direct WhatsApp link")
  assert(crmClient.includes("searchTerm"), "missing quick search filter")
  assert(crmClient.includes("Mover para"), "missing quick move submenu for mobile/accessibility")
})


