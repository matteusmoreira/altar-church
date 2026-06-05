import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("dashboard uses real aggregate data instead of mock metrics", () => {
  const page = read("src/app/(dashboard)/dashboard/page.tsx")
  const client = read("src/app/(dashboard)/dashboard/dashboard-client.tsx")

  assert.doesNotMatch(page, /"use client"/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.match(page, /getPeopleDashboardData/)
  assert.match(page, /getGroupsDashboardData/)
  assert.match(page, /getContentDashboardData/)

  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
  assert.match(client, /DashboardClient/)
  assert.match(client, /ResponsiveContainer/)
})
