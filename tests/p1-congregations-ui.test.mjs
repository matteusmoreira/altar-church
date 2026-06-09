import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("congregations page uses real server data and client actions", () => {
  const page = read("src/app/(dashboard)/congregacoes/page.tsx")
  const client = read("src/app/(dashboard)/congregacoes/congregations-client.tsx")
  const routeActions = read("src/app/(dashboard)/congregacoes/actions.ts")
  const data = read("src/lib/congregations/data.ts")
  const actions = read("src/lib/congregations/actions.ts")
  const types = read("src/lib/congregations/types.ts")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /listCongregations/)
  assert.match(page, /CongregationsClient/)
  assert.doesNotMatch(page, /mockCongregations/)

  assert.match(client, /^"use client"/)
  assert.match(client, /saveCongregation/)
  assert.match(client, /deleteCongregation/)
  assert.match(client, /router\.refresh\(\)/)
  assert.match(client, /congregationsResult\.congregations/)
  assert.match(client, /Nova congregação/)
  assert.doesNotMatch(client, /mockCongregations/)
  assert.doesNotMatch(client, /setCongregations/)

  assert.match(routeActions, /saveCongregation/)
  assert.match(routeActions, /deleteCongregation/)
  assert.match(types, /CongregationListItem/)
  assert.match(types, /SaveCongregationInput/)

  assert.match(data, /export async function listCongregations/)
  assert.match(data, /requirePermission\("members\.view"/)
  assert.match(data, /from public\.congregations/i)
  assert.match(data, /deleted_at is null/i)

  assert.match(actions, /export async function saveCongregation/)
  assert.match(actions, /export async function deleteCongregation/)
  assert.match(actions, /requirePermission\("settings\.edit"/)
  assert.match(actions, /writeAuditLog/)
  assert.match(actions, /action: "congregation\.save"/)
  assert.match(actions, /action: "congregation\.delete"/)
  assert.match(actions, /revalidatePath\("\/congregacoes"\)/)
})
