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
