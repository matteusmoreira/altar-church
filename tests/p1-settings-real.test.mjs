import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("settings uses real company profiles instead of mock access and invoices", () => {
  const data = read("src/lib/settings/data.ts")
  const page = read("src/app/(dashboard)/configuracoes/page.tsx")
  const client = read("src/app/(dashboard)/configuracoes/settings-client.tsx")

  assert.match(data, /export async function getSettingsData/)
  assert.match(data, /from public\.profiles/i)
  assert.match(data, /requirePermission\("settings\.manage_settings"/)

  assert.doesNotMatch(page, /"use client"/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.match(page, /getSettingsData/)

  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
  assert.match(client, /SettingsClient/)
})
