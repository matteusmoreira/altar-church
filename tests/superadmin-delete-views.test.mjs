import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const actions = await readFile(
  new URL("../src/lib/admin/actions.ts", import.meta.url),
  "utf8"
)
const consoleUi = await readFile(
  new URL("../src/components/admin/superadmin-console.tsx", import.meta.url),
  "utf8"
)
const migration = await readFile(
  new URL("../supabase/migrations/20260720120000_admin_profile_deletion.sql", import.meta.url),
  "utf8"
)

test("superadmin permanently deletes companies and profiles with safety guards", () => {
  assert.match(actions, /export async function deleteCompany/)
  assert.match(actions, /export async function deleteProfile/)
  assert.match(actions, /actor\.id === id/)
  assert.match(actions, /supabase\.auth\.admin\.deleteUser/)
  assert.match(actions, /supabase\.storage\.from\(bucket\)\.remove\(paths\)/)
  assert.match(actions, /action: "company\.delete"/)
  assert.match(actions, /action: "profile\.delete"/)
})

test("superadmin resource tabs expose list, grid and typed deletion confirmation", () => {
  assert.match(consoleUi, /const \[companyView, setCompanyView\]/)
  assert.match(consoleUi, /const \[userView, setUserView\]/)
  assert.match(consoleUi, /const \[planView, setPlanView\]/)
  assert.match(consoleUi, /const \[moduleView, setModuleView\]/)
  assert.match(consoleUi, /companyView === "list"/)
  assert.match(consoleUi, /userView === "list"/)
  assert.match(consoleUi, /planView === "grid"/)
  assert.match(consoleUi, /moduleView === "grid"/)
  assert.match(consoleUi, /deleteConfirmation !== deleteTarget\.confirmation/)
  assert.match(consoleUi, /Excluir permanentemente/)
})

test("profile deletion preserves Kids chat history", () => {
  assert.match(migration, /alter column sender_profile_id drop not null/)
  assert.match(migration, /on delete set null/)
})
