import { expect, test } from "@playwright/test"
import { gotoAuthenticated } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()
test.use({ storageState: "playwright/.auth/admin.json", timezoneId: "America/Sao_Paulo" })

test("legacy follow-up routes open the preserved archive", async ({ page }) => {
  for (const route of ["/configuracoes/follow-up", "/pessoas/follow-up"]) {
    await gotoAuthenticated(page, e2e.accounts.admin, route)
    await expect(page).toHaveURL(/\/automacoes\?tab=/)
    await expect(page.getByRole("heading", { name: "Automações", exact: true })).toBeVisible()
    await expect(page.getByLabel("Buscar histórico")).toBeVisible()
    await expect(page.getByText(/Follow-up e Trilhas foram encerrados/)).toBeVisible()
    await expect(page.getByRole("button", { name: /Configurar regra|Nova trilha/ })).toHaveCount(0)
  }
})

test("people configuration keeps activities without the retired journey builder", async ({ page }) => {
  await gotoAuthenticated(page, e2e.accounts.admin, "/pessoas?tab=config#trilhas")
  await expect(page.getByRole("tab", { name: "Atividades & Parâmetros" })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("button", { name: "Nova atividade", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Nova trilha", exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
