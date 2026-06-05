import { expect, type Page } from "@playwright/test"
import type { E2EAccount } from "./accounts"

export async function loginAs(page: Page, account: E2EAccount) {
  await page.goto("/login")
  await page.getByLabel("E-mail").fill(account.email)
  await page.getByLabel("Senha").fill(account.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
  await expect(page.getByText(account.role, { exact: true })).toBeVisible()
}

export async function resetSession(page: Page) {
  await page.context().clearCookies()
  await page.goto("/")
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.context().clearCookies()
}

export async function expectNoDevError(page: Page) {
  await expect(page.locator("[data-nextjs-dialog-overlay]")).toHaveCount(0)
  await expect(page.getByText("Build Error", { exact: false })).toHaveCount(0)
  await expect(page.getByText("Unhandled Runtime Error", { exact: false })).toHaveCount(0)
}
