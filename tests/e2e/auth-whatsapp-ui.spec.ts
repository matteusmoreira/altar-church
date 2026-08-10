import { expect, test } from "@playwright/test"
import { readE2EAccounts } from "./helpers/accounts"
import { loginAs } from "./helpers/auth"

const e2e = readE2EAccounts()

test("login por e-mail continua autenticando a conta existente", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
})

test("login alterna profissionalmente entre e-mail e WhatsApp com máscara", async ({ page }) => {
  await page.goto("/login", { waitUntil: "load" })
  await expect(page.getByTestId("login-method-email")).toHaveAttribute("aria-selected", "true")
  await page.getByTestId("login-method-whatsapp").click()
  await expect(page.getByTestId("login-method-whatsapp")).toHaveAttribute("aria-selected", "true")
  await page.locator("#whatsapp").fill("11987654321")
  await expect(page.locator("#whatsapp")).toHaveValue("(11) 98765-4321")
  await page.getByTestId("login-method-email").click()
  await expect(page.locator("#email")).toBeVisible()
})

test("recuperação mantém resposta genérica para conta inexistente", async ({ page }) => {
  await page.goto("/recuperar-senha", { waitUntil: "load" })
  await page.locator("#recovery-whatsapp").fill("11987654321")
  await expect(page.locator("#recovery-whatsapp")).toHaveValue("(11) 98765-4321")
  await page.getByRole("button", { name: "Enviar código no WhatsApp" }).click()
  await expect(page.getByText(/Se a conta possuir WhatsApp/)).toBeVisible()
  await expect(page.getByLabel("Código de 6 dígitos")).toBeVisible()
})
