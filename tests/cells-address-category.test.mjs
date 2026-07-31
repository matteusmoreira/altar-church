import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("cell form keeps CEP-first full address and ViaCEP lookup", () => {
  const client = read("src/app/(dashboard)/gceus/groups-client.tsx")
  const sharedForm = read("src/components/cells/cell-form-fields.tsx")
  const form = `${client}\n${sharedForm}`
  const action = read("src/lib/groups/actions.ts")
  const data = read("src/lib/groups/data.ts")
  const migration = read("supabase/migrations/20260730200000_cells_address_fields.sql")

  for (const field of ["postal_code", "address_number", "address_complement", "state"]) {
    assert.match(migration, new RegExp(`add column if not exists ${field}`))
    assert.match(action, new RegExp(field.replaceAll("_", "_")))
  }
  assert.match(form, /group-postal-code-input/)
  assert.match(form, /fetch\(`\/api\/cep\/\$\{cepDigits\}`/)
  assert.match(form, /meetingLocation: data\.street/)
  assert.match(form, /neighborhood: data\.neighborhood/)
  assert.match(form, /city: data\.city/)
  assert.match(form, /state: data\.state/)
  assert.match(data, /g\.postal_code/)
})

test("cell category can be created from selector with tenant validation and audit", () => {
  const client = read("src/app/(dashboard)/gceus/groups-client.tsx")
  const sharedForm = read("src/components/cells/cell-form-fields.tsx")
  const form = `${client}\n${sharedForm}`
  const action = read("src/lib/groups/actions.ts")

  assert.match(form, /group-category-create-button/)
  assert.match(client, /createGroupCategory\(/)
  assert.match(client, /setForm\(\(current\) => \(\{ \.\.\.current, categoryId: result\.id/)
  assert.match(action, /export async function createGroupCategory/)
  assert.match(action, /requirePermission\("cells\.edit", companyId\)/)
  assert.match(action, /lower\(name\) = lower\(\$\{parsed\.name\}\)/)
  assert.match(action, /action: "group\.category\.save"/)
})
