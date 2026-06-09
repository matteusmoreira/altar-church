import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const page = readFileSync("src/app/(dashboard)/relatorios/page.tsx", "utf8")

test("reports page uses persisted module data instead of dashboard mocks", () => {
  assert(!page.includes("@/lib/mock/data"))
  assert(page.includes("getPeopleDashboardData"))
  assert(page.includes("getGroupsDashboardData"))
  assert(page.includes("getContentDashboardData"))
  assert(page.includes("listGroupMeetingReports"))
  assert(page.includes("ReportsClient"))
})
