import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("discipleship page exposes reading plan step editor and delete", () => {
  const page = readFileSync("src/app/(dashboard)/discipulado/page.tsx", "utf8")
  const actions = readFileSync("src/lib/operational/actions.ts", "utf8")
  assert.match(page, /saveReadingPlanStep/)
  assert.match(page, /deleteReadingPlanStep/)
  assert.match(page, /dayNumber/)
  assert.match(actions, /export async function saveReadingPlanStep/)
  assert.match(actions, /export async function deleteReadingPlanStep/)
  assert.match(actions, /reading_plan_steps/)
})

test("finance page can soft-delete revenues and expenses", () => {
  const page = readFileSync("src/app/(dashboard)/financeiro/page.tsx", "utf8")
  const actions = readFileSync("src/lib/operational/actions.ts", "utf8")
  assert.match(page, /deleteRevenue/)
  assert.match(page, /deleteExpense/)
  assert.match(actions, /export async function deleteRevenue/)
  assert.match(actions, /export async function deleteExpense/)
  assert.match(actions, /finance\.delete/)
})

test("attendance and crm link people from directory", () => {
  const attendance = readFileSync("src/app/(dashboard)/presenca/page.tsx", "utf8")
  const crm = readFileSync("src/app/(dashboard)/crm/page.tsx", "utf8")
  const crmClient = readFileSync("src/app/(dashboard)/crm/crm-client.tsx", "utf8")
  const data = readFileSync("src/lib/operational/data.ts", "utf8")
  const actions = readFileSync("src/lib/operational/actions.ts", "utf8")
  assert.match(attendance, /listPeopleDirectory/)
  assert.match(attendance, /personId/)
  assert.match(crm, /listPeopleDirectory/)
  assert.match(crmClient, /personId/)
  assert.match(data, /export async function listPeopleDirectory/)
  assert.match(actions, /resolvePersonReference/)
  assert.match(actions, /person_id/)
})

test("dashboard shell uses multi-tenant church name instead of hard-coded label", () => {
  const layout = readFileSync("src/app/(dashboard)/layout.tsx", "utf8")
  const shell = readFileSync("src/components/layout/dashboard-layout.tsx", "utf8")
  assert.match(layout, /churchName/)
  assert.match(layout, /from public\.companies/)
  assert.match(shell, /churchName/)
  assert.doesNotMatch(shell, /Igreja Batista Central/)
})

test("self-service registration is available for church slug onboarding", () => {
  const registerPage = readFileSync("src/app/(auth)/register/page.tsx", "utf8")
  const registerAction = readFileSync("src/lib/auth/register.ts", "utf8")
  const loginPage = readFileSync("src/app/(auth)/login/page.tsx", "utf8")
  assert.match(registerPage, /registerSelfServiceUser/)
  assert.match(registerPage, /companySlug/)
  assert.match(registerAction, /createUser/)
  assert.match(registerAction, /role.*member|member/)
  assert.match(loginPage, /\/register/)
})
