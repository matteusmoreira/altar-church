import { expect, test } from "@playwright/test"
import { expectNoDevError, loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()

const friendlyRoutes = [
  "/dashboard",
  "/informacoes",
  "/ministerios",
  "/programacao",
  "/louvor",
  "/congregacoes",
  "/pessoas",
  "/visitantes",
  "/gceus",
  "/celulas",
  "/intercessao",
  "/discipulado",
  "/eventos",
  "/conteudo",
  "/notificacao",
  "/comunicacao",
  "/inpeace-play",
  "/presenca",
  "/crm",
  "/financeiro",
  "/doacao",
  "/relatorios",
  "/configuracoes",
]

const legacyRoutes = [
  "/attendance",
  "/cells",
  "/church-info",
  "/communication",
  "/congregations",
  "/content",
  "/donations",
  "/events",
  "/finance",
  "/groups",
  "/members",
  "/ministries",
  "/notifications",
  "/prayer",
  "/programming",
  "/reading-plans",
  "/reports",
  "/settings",
  "/songs",
  "/visitors",
]

test("rota antiga redireciona para slug amigavel e preserva caminho aninhado", async ({ page }) => {
  await loginAs(page, e2e.accounts.admin)

  await page.goto("/church-info?origem=e2e", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/informacoes\?origem=e2e$/)

  await page.goto("/members", { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(/\/pessoas$/)
  const personHref = await page.getByRole("link", { name: /Joao|João|Maria|Ana/i }).first().getAttribute("href")
  expect(personHref).toMatch(/^\/pessoas\//)
  const personId = personHref?.split("/").at(-1)
  expect(personId).toBeTruthy()
  await page.goto(`/members/${personId}?origem=e2e`, { waitUntil: "domcontentloaded" })
  await expect(page).toHaveURL(new RegExp(`/pessoas/${personId}\\?origem=e2e$`))
})

test("menus e atalhos publicam somente slugs amigaveis", async ({ page }, testInfo) => {
  await loginAs(page, e2e.accounts.superadmin)
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)
  await expect(page.locator('a[href="/pessoas"]:visible').first()).toBeVisible()

  if (testInfo.project.name === "chrome-mobile") {
    await page.getByRole("button", { name: "Abrir menu" }).click()
  }

  const hrefs = await page.locator("a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")).filter((href): href is string => Boolean(href))
  )

  expect(hrefs).toContain("/informacoes")
  expect(hrefs).toContain("/pessoas")
  expect(hrefs).not.toEqual(expect.arrayContaining(legacyRoutes))
})

test("select compartilhado abre alinhado, legivel e dentro da viewport", async ({ page }, testInfo) => {
  await loginAs(page, e2e.accounts.admin)
  await page.goto("/celulas", { waitUntil: "domcontentloaded" })
  await expectNoDevError(page)

  const trigger = page.locator('[data-slot="select-trigger"]').first()
  await expect(trigger).toBeVisible()
  await expect(trigger).toContainText("Todas")
  await trigger.click()

  const popup = page.locator('[data-slot="select-content"]').first()
  await expect(popup).toBeVisible()
  const [triggerBox, popupBox, viewport] = await Promise.all([
    trigger.boundingBox(),
    popup.boundingBox(),
    page.evaluate(() => ({ width: window.innerWidth })),
  ])

  expect(triggerBox).not.toBeNull()
  expect(popupBox).not.toBeNull()
  const expectedMinHeight = testInfo.project.name === "chrome-mobile" ? 40 : 28
  expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(expectedMinHeight)
  expect(popupBox?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((popupBox?.x ?? 0) + (popupBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1)
})

test("dashboard inteiro nao cria overflow horizontal no Chrome mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chrome-mobile", "auditoria exclusiva do viewport mobile")
  test.setTimeout(240_000)
  await loginAs(page, e2e.accounts.superadmin)

  for (const route of friendlyRoutes) {
    await page.goto(route, { waitUntil: "domcontentloaded" })
    await expectNoDevError(page)
    await expect(page.locator("main").first()).toBeVisible()

    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))

    expect(dimensions.document, `${route} document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1)
    expect(dimensions.body, `${route} body overflow`).toBeLessThanOrEqual(dimensions.viewport + 1)
  }
})
