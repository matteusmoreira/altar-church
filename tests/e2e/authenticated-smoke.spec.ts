import { expect, test } from "@playwright/test"
import { loginAs, expectNoDevError, resetSession } from "./helpers/auth"
import { readE2EAccounts, type E2ERole } from "./helpers/accounts"

const e2e = readE2EAccounts()

const roles: E2ERole[] = ["superadmin", "admin", "member"]

for (const role of roles) {
  test(`${role} faz login no Chrome e abre dashboard`, async ({ page }) => {
    await loginAs(page, e2e.accounts[role])
    await expectNoDevError(page)
    await expect(page.getByRole("heading", { name: /Dashboard|Visao geral|Visão geral/i })).toBeVisible()
  })
}

test("superadmin acessa console administrativo e admin comum nao acessa", async ({ page }) => {
  test.setTimeout(90_000)
  await loginAs(page, e2e.accounts.superadmin)
  await page.goto("/admin", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  await expect(page).toHaveURL(/\/admin/)
  await expect(page.getByRole("heading", { name: "SuperAdmin" })).toBeVisible()

  await resetSession(page)
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/admin", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/dashboard/)
})

test("admin logado abre Pessoas e detalhe real de pessoa", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/members")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Pessoas" })).toBeVisible()
  await page.getByRole("link", { name: /Joao|João|Maria|Ana/i }).first().click()
  await expect(page).toHaveURL(/\/members\/[0-9a-f-]+/)
  await expectNoDevError(page)
  await expect(page.getByText("Histórico pastoral")).toBeVisible()
  await page.getByRole("tab", { name: "Jornada" }).click()
  await expect(page.getByText("Jornada de integração")).toBeVisible()
})

test("admin logado revisa duplicidades em Pessoas", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/members")
  await expectNoDevError(page)
  await page.getByRole("tab", { name: "Duplicidades" }).click()
  await expect(page.getByRole("heading", { name: "Duplicidades" })).toBeVisible()
  await expect(page.getByText(/possivel duplicidade|possível duplicidade/i).first()).toBeVisible()
  await expect(page.getByRole("button", { name: /Ignorar suspeita|Resolver duplicidade/i }).first()).toBeVisible()
})

test("admin logado cria edita e exclui congregacao real", async ({ page }) => {
  const stamp = Date.now()
  const name = `Congregacao E2E ${stamp}`
  const updatedResponsible = `Responsavel E2E ${stamp}`

  await loginAs(page, e2e.accounts.admin)
  await page.goto("/congregations")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Congregações" })).toBeVisible()

  await page.getByRole("button", { name: "Nova congregação" }).click()
  await page.getByPlaceholder("Nome da congregação").fill(name)
  await page.getByPlaceholder("Nome do responsável").fill("Responsável E2E")
  await page.getByPlaceholder("Endereço completo").fill("Rua E2E, 123")
  await page.getByRole("button", { name: "Cadastrar" }).click()
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible()

  await page.getByRole("button", { name: `Ações de ${name}` }).click()
  await page.getByRole("menuitem", { name: "Editar" }).click()
  await page.getByPlaceholder("Nome do responsável").fill(updatedResponsible)
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await expect(page.getByRole("cell", { name: updatedResponsible, exact: true })).toBeVisible()

  await page.getByRole("button", { name: `Ações de ${name}` }).click()
  await page.getByRole("menuitem", { name: "Excluir" }).click()
  await page.getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByRole("cell", { name, exact: true })).toBeHidden()
})

test("admin logado salva informacoes reais da igreja", async ({ page }) => {
  const stamp = Date.now()
  const publicName = `Igreja E2E ${stamp}`
  const website = `https://igreja-e2e-${stamp}.test`
  const instagram = `https://instagram.com/e2e_${stamp}`

  await loginAs(page, e2e.accounts.admin)
  await page.goto("/church-info")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Informações da Igreja" })).toBeVisible()

  const publicNameInput = page.getByPlaceholder("Nome exibido publicamente")
  const websiteInput = page.getByPlaceholder("https://www.igreja.com.br")
  const instagramInput = page.getByPlaceholder("URL do Instagram")
  const originalPublicName = await publicNameInput.inputValue()
  const originalWebsite = await websiteInput.inputValue()
  const originalInstagram = await instagramInput.inputValue()

  await publicNameInput.fill(publicName)
  await websiteInput.fill(website)
  await instagramInput.fill(instagram)
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await expect(page.getByText("Informações da igreja salvas com sucesso")).toBeVisible()

  await page.reload()
  await expect(page.getByPlaceholder("Nome exibido publicamente")).toHaveValue(publicName)
  await expect(page.getByPlaceholder("https://www.igreja.com.br")).toHaveValue(website)
  await expect(page.getByPlaceholder("URL do Instagram")).toHaveValue(instagram)

  await page.getByPlaceholder("Nome exibido publicamente").fill(originalPublicName)
  await page.getByPlaceholder("https://www.igreja.com.br").fill(originalWebsite)
  await page.getByPlaceholder("URL do Instagram").fill(originalInstagram)
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await expect(page.getByText("Informações da igreja salvas com sucesso")).toBeVisible()
})

test("admin logado abre Conteúdo real e modal de publicação", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/content")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "Conteúdo" })).toBeVisible()
  await expect(page.getByText("Culto de Celebração neste domingo")).toBeVisible()
  await expect(page.getByText("Bem-vindo ao Altar Church")).toBeVisible()

  await page.getByRole("button", { name: "Novo conteúdo" }).click()
  await expect(page.getByRole("dialog", { name: "Novo conteúdo" })).toBeVisible()
  await expect(page.getByText("Notícias").first()).toBeVisible()
  await expect(page.getByText("Rascunho")).toBeVisible()
  await page.getByRole("button", { name: "Cancelar" }).click()
})

test("portal público da igreja consome conteúdo real publicado", async ({ page }) => {
  await page.goto("/church/batista-central")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: /Igreja E2E|Batista/i })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Conteúdos recentes" })).toBeVisible()
  await expect(page.getByText("Perseverança em tempos difíceis")).toBeVisible()
  await expect(page.getByText("Culto de Celebração neste domingo")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Congregações" })).toBeVisible()
})

test("admin logado cria edita e exclui grupo real", async ({ page }) => {
  test.setTimeout(90_000)
  const stamp = Date.now()
  const name = `GCEU E2E ${stamp}`
  const description = `Grupo E2E criado pelo fluxo autenticado ${stamp}`
  const updatedDescription = `Grupo E2E atualizado pelo fluxo autenticado ${stamp}`

  await loginAs(page, e2e.accounts.admin)
  await page.goto("/groups")
  await expectNoDevError(page)
  await expect(page.getByRole("heading", { name: "GCEUs e grupos" })).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "GCEU Família Restaurada" })).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "GCEU Jovens em Ação" })).toBeVisible()

  await page.getByRole("button", { name: "Novo grupo" }).click()
  await expect(page.getByRole("dialog", { name: "Novo grupo" })).toBeVisible()
  await page.getByTestId("group-name-input").fill(name)
  await page.getByTestId("group-description-input").fill(description)
  await page.getByTestId("group-category-select").click()
  await page.getByRole("option", { name: "Família" }).click()
  await page.getByTestId("group-day-select").click()
  await page.getByRole("option", { name: "Quarta" }).click()
  await page.getByTestId("group-time-input").fill("20:15")
  await page.getByTestId("group-location-input").fill("Rua E2E dos Grupos, 123")
  await page.getByTestId("group-neighborhood-input").fill("Centro")
  await page.getByTestId("group-city-input").fill("São Paulo")
  await page.getByTestId("group-capacity-input").fill("12")
  await page.getByTestId("group-save-button").click()
  const groupRow = page.getByRole("row").filter({ hasText: name })
  const groupActionsButton = page.getByRole("button", { name: `Ações de ${name}` })
  await expect(groupRow).toBeVisible()

  await page.getByTestId("group-ops-group-select").click()
  await page.getByRole("option", { name }).click()
  await page.getByTestId("group-member-person-select").click()
  await page.getByRole("option", { name: "Ana Costa" }).click()
  await page.getByTestId("group-member-role-select").click()
  await page.getByRole("option", { name: "Visitante" }).click()
  await page.getByTestId("group-member-save-button").click()
  await expect(page.getByRole("row").filter({ hasText: "Ana Costa" })).toBeVisible()

  const meetingTitle = `Relatório E2E ${stamp}`
  await page.getByRole("tab", { name: "Reuniões" }).click()
  await page.getByTestId("group-meeting-title-input").fill(meetingTitle)
  await page.getByTestId("group-meeting-location-input").fill("Sala E2E")
  await page.getByTestId("group-meeting-present-input").fill("3")
  await page.getByTestId("group-meeting-visitor-input").fill("1")
  await page.getByTestId("group-meeting-notes-input").fill("Relatório persistido pelo E2E")
  await page.getByTestId("group-meeting-save-button").click()
  const meetingsPanel = page.getByRole("tabpanel", { name: "Reuniões" })
  await expect(meetingsPanel.getByText(meetingTitle).first()).toBeVisible()
  await expect(meetingsPanel.getByText("3 presentes · 1 visitantes").first()).toBeVisible()

  await expect(groupActionsButton).toBeEnabled()
  await groupActionsButton.click()
  await page.getByRole("menuitem", { name: "Editar" }).click()
  await expect(page.getByRole("dialog", { name: "Editar grupo" })).toBeVisible()
  await page.getByTestId("group-description-input").fill(updatedDescription)
  await page.getByTestId("group-save-button").click()
  await expect(page.getByText(updatedDescription)).toBeVisible()

  await expect(groupActionsButton).toBeEnabled()
  await groupActionsButton.click()
  await page.getByRole("menuitem", { name: "Excluir" }).click()
  await page.getByRole("button", { name: "Excluir" }).click()
  await expect(groupRow).toBeHidden()
})

test("admin logado faz smoke dos modulos P4", async ({ page }) => {
  test.setTimeout(90_000)
  await loginAs(page, e2e.accounts.admin)

  const modules = [
    { path: "/events", heading: /Eventos/i },
    { path: "/attendance", heading: /Presen/i },
    { path: "/prayer", heading: /Ora|Intercess/i },
    { path: "/reading-plans", heading: /Planos de Leitura/i },
    { path: "/communication", heading: /Comunica/i },
    { path: "/notifications", heading: /Notifica/i },
    { path: "/crm", heading: /CRM/i },
    { path: "/finance", heading: /Financeiro/i },
    { path: "/donations", heading: /Doa/i },
    { path: "/inpeace-play", heading: /InPeace Play/i },
    { path: "/reports", heading: /Relat/i },
  ]

  for (const entry of modules) {
    await page.goto(entry.path)
    await expectNoDevError(page)
    await expect(page.getByRole("heading", { name: entry.heading }).first()).toBeVisible()
  }
})

test("admin logado exporta CSV dos relatorios operacionais", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)
  for (const exportPath of ["/api/reports/export", "/api/finance/export", "/api/donations/export"]) {
    const response = await page.request.get(exportPath)
    expect(response.ok()).toBeTruthy()
    expect(response.headers()["content-type"]).toContain("text/csv")
    expect(await response.text()).toMatch(/;|Seção|Tipo/)
  }
})
