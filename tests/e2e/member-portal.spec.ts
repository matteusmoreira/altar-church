import { expect, test } from "@playwright/test"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()

for (const width of [360, 390, 430]) {
  test(`portal do membro funciona em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await loginAs(page, e2e.accounts.member)
    await expect(page).toHaveURL(/\/membro/)
    await expect(page.getByRole("navigation", { name: "Navegação do Portal do Membro" }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Células/ }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Ministérios/ }).first()).toBeVisible()
    await expect(page.getByRole("link", { name: /Kids/ }).first()).toBeVisible()
    await expectNoDevError(page)
  })
}

test("membro abre as quatro áreas e não acessa dashboard administrativo", async ({ page }) => {
  await loginAs(page, e2e.accounts.member)
  for (const path of ["/membro/celulas", "/membro/ministerios", "/membro/kids"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(new RegExp(path))
    await expectNoDevError(page)
  }
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/membro/)
})
