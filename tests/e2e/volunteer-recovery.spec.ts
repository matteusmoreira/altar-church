import { expect, test } from "@playwright/test"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()

test("admin usa as cinco áreas do Voluntariado sem catálogo Louvor", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/voluntariado", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  await page.locator('[data-testid="volunteer-manager"][data-ready="true"]').waitFor()

  await expect(page.getByRole("heading", { name: "Voluntariado 2.0" })).toBeVisible()
  for (const tab of [
    "Visão geral",
    "Voluntários",
    "Equipes",
    "Cultos e escalas",
    "Comunicação",
  ]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible()
  }

  await page.getByRole("tab", { name: "Cultos e escalas" }).click()
  await expect(page.getByText("Equipes e funções necessárias")).toBeVisible()
  await expect(page.getByText(/catálogo.*louvor/i)).toHaveCount(0)
  await expect(page.getByText(/setlist/i)).toHaveCount(0)
})

test("cadastro de voluntário exige Pessoa existente e busca com três letras", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/voluntariado", { waitUntil: "domcontentloaded" })
  await page.locator('[data-testid="volunteer-manager"][data-ready="true"]').waitFor()
  await page.getByRole("tab", { name: "Voluntários" }).click()

  const peopleSearch = page.getByPlaceholder("Digite ao menos 3 letras para buscar em Pessoas")
  await expect(peopleSearch).toBeVisible()
  await peopleSearch.fill("ab")
  await expect(page.getByRole("button", { name: /Salvar voluntário/i })).toBeVisible()
  await expect(page.getByText("Selecione uma Pessoa já cadastrada e defina onde ela serve.")).toBeVisible()
  await expectNoDevError(page)
})
