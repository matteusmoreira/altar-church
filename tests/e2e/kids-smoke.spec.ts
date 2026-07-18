import { existsSync, readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import postgres from "postgres"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

function loadLocalEnv() {
  if (process.env.POSTGRES_URL || !existsSync(".env.local")) return
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim()
  }
}

loadLocalEnv()
const e2e = readE2EAccounts()
let sql: ReturnType<typeof postgres> | null = null
let companyId: string | null = null
let previousEnabled: boolean | null = null

test.beforeAll(async () => {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL não configurada")
  sql = postgres(process.env.POSTGRES_URL, { max: 1 })
  const [profile] = await sql<{ company_id: string }[]>`
    select company_id from public.profiles
    where lower(email) = lower(${e2e.accounts.admin.email}) and active = true
    limit 1
  `
  companyId = profile?.company_id ?? null
  if (!companyId) throw new Error("Empresa E2E do admin não encontrada")
  const [current] = await sql<{ enabled: boolean }[]>`
    select enabled from public.company_modules where company_id = ${companyId} and module_id = 'kids'
  `
  previousEnabled = current ? current.enabled : null
  await sql`
    insert into public.company_modules (company_id, module_id, enabled)
    values (${companyId}, 'kids', true)
    on conflict (company_id, module_id) do update set enabled = true
  `
})

test.afterAll(async () => {
  if (sql && companyId) {
    if (previousEnabled === null) {
      await sql`delete from public.company_modules where company_id = ${companyId} and module_id = 'kids'`
    } else {
      await sql`update public.company_modules set enabled = ${previousEnabled} where company_id = ${companyId} and module_id = 'kids'`
    }
  }
  if (sql) await sql.end()
})

test("admin abre hub e recepção Kids sem erro ou overflow", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)

  await page.goto("/kids", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Kids", exact: true })).toBeVisible()
  await expect(page.getByRole("tab", { name: /Visão geral/i })).toBeVisible()
  await page.getByRole("tab", { name: "Famílias" }).click()
  await expect(page.getByRole("button", { name: "Tirar foto" })).toHaveCount(2)
  await expect(page.getByRole("button", { name: "Galeria" })).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  await page.goto("/kids/recepcao", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Recepção Kids" })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
