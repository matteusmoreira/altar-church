import { expect, test } from "@playwright/test"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()
const portalPersonas = {
  member: e2e.accounts.member,
  visitor: e2e.portalAccounts?.visitor,
  attendee: e2e.portalAccounts?.attendee,
  volunteer: e2e.portalAccounts?.volunteer,
  ministryLeader: e2e.portalAccounts?.ministryLeader,
  ministryLeaderVolunteer: e2e.portalAccounts?.ministryLeaderVolunteer,
}

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

for (const [persona, account] of Object.entries(portalPersonas)) {
  test(`${persona} usa portal comum e não acessa dashboard`, async ({ page }) => {
    test.skip(!account, `Conta E2E ${persona} não configurada`)
    if (!account) return
    await loginAs(page, account)
    await expect(page).toHaveURL(/\/membro/)
    await expect(page.getByText("Portal do Membro", { exact: false }).first()).toBeVisible()
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/membro/)
  })
}

test("admin permanece no dashboard administrativo", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await expect(page).toHaveURL(/\/dashboard/)
})

for (const persona of ["volunteer", "ministryLeaderVolunteer"] as const) {
  const account = e2e.portalAccounts?.[persona]
  test(`${persona} recebe capacidade de voluntariado`, async ({ page }) => {
    test.skip(!account, `Conta E2E ${persona} não configurada`)
    if (!account) return
    await loginAs(page, account)
    await expect(page.getByRole("link", { name: "Voluntariado" }).first()).toBeVisible()
    await page.goto("/membro/voluntariado", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Minha escala" })).toBeVisible()
  })
}

for (const persona of ["ministryLeader", "ministryLeaderVolunteer"] as const) {
  const account = e2e.portalAccounts?.[persona]
  test(`${persona} configura somente ministério próprio`, async ({ page }) => {
    test.skip(!account, `Conta E2E ${persona} não configurada`)
    if (!account) return
    await loginAs(page, account)
    await page.goto("/membro/ministerios", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: "Configurar ministério" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Configurar ministério" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel("Responsável")).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: /Excluir/ })).toHaveCount(0)
    await dialog.getByLabel("Contato").fill(`E2E ${persona}`)
    await dialog.getByRole("button", { name: "Salvar" }).click()
    await expect(page.getByText("Configurações salvas")).toBeVisible()
  })
}
