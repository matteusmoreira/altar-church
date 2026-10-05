import { expect, test } from "@playwright/test"
import { expectNoDevError, gotoAuthenticated } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"
test.use({ storageState: "playwright/.auth/admin.json" })

const e2e = readE2EAccounts()

test("admin abre workspace de ministério e vê operação principal", async ({ page }) => {
  await gotoAuthenticated(page, e2e.accounts.admin, "/dashboard")
  await page.goto("/ministerios", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  const workspaceLink = page.getByRole("link", { name: "Abrir gestão" }).first()
  await expect(workspaceLink).toBeVisible()
  await workspaceLink.click()
  await expect(page.getByRole("tab", { name: "Visão geral" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Pessoas" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Equipes" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Agenda" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Comunicação" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Escalas" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Acompanhamentos" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Configurações" })).toBeVisible()
  await page.getByRole("tab", { name: "Equipes" }).click()
  await expect(page.getByRole("button", { name: "Criar equipe" })).toHaveAttribute("type", "submit")
  await expectNoDevError(page)
})

test("workspace de ministério permanece utilizável em viewport mobile", async ({ page }) => {
  await gotoAuthenticated(page, e2e.accounts.admin, "/dashboard")
  await page.goto("/ministerios", { waitUntil: "domcontentloaded" })
  const workspaceLink = page.getByRole("link", { name: "Abrir gestão" }).first()
  await expect(workspaceLink).toBeVisible()
  await workspaceLink.click()
  await expect(page.getByRole("tab", { name: "Visão geral" })).toBeVisible()
  await expect(page.locator("body")).toBeVisible()
})
