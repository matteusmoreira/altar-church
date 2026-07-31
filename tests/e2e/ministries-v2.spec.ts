import { expect, test } from "@playwright/test"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()

test("admin abre workspace de ministério e vê operação principal", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/ministerios", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  const workspaceLink = page.getByRole("link", { name: "Abrir gestão" }).first()
  if (await workspaceLink.count() === 0) test.skip()
  await workspaceLink.click()
  await expect(page.getByRole("tab", { name: "Visão geral" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Pessoas" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Equipes" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Agenda" })).toBeVisible()
  await expect(page.getByRole("tab", { name: "Comunicação" })).toBeVisible()
  await expectNoDevError(page)
})

test("workspace de ministério permanece utilizável em viewport mobile", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/ministerios", { waitUntil: "domcontentloaded" })
  const workspaceLink = page.getByRole("link", { name: "Abrir gestão" }).first()
  if (await workspaceLink.count() === 0) test.skip()
  await workspaceLink.click()
  await expect(page.getByRole("tab", { name: "Visão geral" })).toBeVisible()
  await expect(page.locator("body")).toBeVisible()
})
