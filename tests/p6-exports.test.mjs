import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("dashboard exports CSV through authenticated audited route handlers", () => {
  const csv = read("src/lib/export/csv.ts")
  const server = read("src/lib/export/server.ts")
  const reportsRoute = read("src/app/api/reports/export/route.ts")
  const financeRoute = read("src/app/api/finance/export/route.ts")
  const donationsRoute = read("src/app/api/donations/export/route.ts")

  assert.match(csv, /text\/csv; charset=utf-8/)
  assert.match(csv, /content-disposition/)
  assert.match(server, /getCurrentUser/)
  assert.match(server, /requirePermission\(permission, companyId\)/)
  assert.match(server, /writeAuditLog/)

  assert.match(reportsRoute, /reports\.export/)
  assert.match(reportsRoute, /auditExport\("reports\.export"/)
  assert.match(reportsRoute, /csvResponse\(`relatorios-/)

  assert.match(financeRoute, /finance\.export/)
  assert.match(financeRoute, /getFinanceData/)
  assert.match(financeRoute, /auditExport\("finance\.export"/)

  assert.match(donationsRoute, /donation\.export/)
  assert.match(donationsRoute, /getDonationData/)
  assert.match(donationsRoute, /auditExport\("donation\.export"/)
})

test("reports, finance and donations pages expose CSV export actions", () => {
  const reportsClient = read("src/app/(dashboard)/relatorios/reports-client.tsx")
  const financePage = read("src/app/(dashboard)/financeiro/page.tsx")
  const donationsPage = read("src/app/(dashboard)/doacao/page.tsx")

  assert.match(reportsClient, /href="\/api\/reports\/export"/)
  assert.match(financePage, /href="\/api\/finance\/export"/)
  assert.match(donationsPage, /href="\/api\/donations\/export"/)
  assert.match(reportsClient, /Exportar CSV/)
  assert.match(financePage, /Exportar CSV/)
  assert.match(donationsPage, /Exportar CSV/)
})
