import { expect, test } from "@playwright/test"
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { expectNoDevError, gotoAuthenticated } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"
const e2e = readE2EAccounts()

// Cada persona precisa da propria sessao: com o storageState do admin, o
// middleware manda /membro para /dashboard antes de qualquer assert. Personas
// sem storageState no setup (visitor, attendee, ministryLeaderVolunteer) partem
// de sessao vazia e logam via UI no gotoAuthenticated.
const personaStorage: Record<string, string | { cookies: []; origins: [] }> = {
  member: "playwright/.auth/member.json",
  volunteer: "playwright/.auth/volunteer.json",
  ministryLeader: "playwright/.auth/ministry-leader.json",
  visitor: { cookies: [], origins: [] },
  attendee: { cookies: [], origins: [] },
  ministryLeaderVolunteer: { cookies: [], origins: [] },
}

test.describe("portal do membro (sessao de membro)", () => {
  test.use({ storageState: personaStorage.member as string })

  for (const width of [360, 390, 430]) {
    test(`portal do membro funciona em ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await gotoAuthenticated(page, e2e.accounts.member, "/membro")
      await expect(page).toHaveURL(/\/membro/)
      await expect(page.getByRole("navigation", { name: "Navegação do Portal do Membro" }).first()).toBeVisible()
      await expect(page.getByRole("link", { name: /Células/ }).first()).toBeVisible()
      await expect(page.getByRole("link", { name: /Ministérios/ }).first()).toBeVisible()
      await expect(page.getByRole("link", { name: /Kids/ }).first()).toBeVisible()
      await expectNoDevError(page)
    })
  }

  test("membro abre agenda, oração, perfil e preferências sem entrar no dashboard", async ({ page }) => {
    await gotoAuthenticated(page, e2e.accounts.member, "/membro")
    for (const path of ["/membro/celulas", "/membro/ministerios", "/membro/kids", "/membro/agenda", "/membro/oracao", "/membro/perfil", "/membro/preferencias"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(new RegExp(path))
      await expectNoDevError(page)
    }
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/membro/)
  })
})

const portalPersonas = {
  member: e2e.accounts.member,
  visitor: e2e.portalAccounts?.visitor,
  attendee: e2e.portalAccounts?.attendee,
  volunteer: e2e.portalAccounts?.volunteer,
  ministryLeader: e2e.portalAccounts?.ministryLeader,
  ministryLeaderVolunteer: e2e.portalAccounts?.ministryLeaderVolunteer,
}

for (const [persona, account] of Object.entries(portalPersonas)) {
  test.describe(`portal comum ${persona}`, () => {
    test.use({ storageState: personaStorage[persona] })

    test(`${persona} usa portal comum e não acessa dashboard`, async ({ page }) => {
      test.skip(!account, `Conta E2E ${persona} não configurada`)
      if (!account) return
      await gotoAuthenticated(page, account, "/membro")
      await expect(page).toHaveURL(/\/membro/)
      await expect(page.getByText("Portal do Membro", { exact: false }).first()).toBeVisible()
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(/\/membro/)
    })
  })
}

test("admin permanece no dashboard administrativo", async ({ page }) => {
  await gotoAuthenticated(page, e2e.accounts.admin, "/dashboard")
  await expect(page).toHaveURL(/\/dashboard/)
})

for (const persona of ["volunteer", "ministryLeaderVolunteer"] as const) {
  const account = e2e.portalAccounts?.[persona]
  test.describe(`voluntariado ${persona}`, () => {
    test.use({ storageState: personaStorage[persona] })

    test(`${persona} recebe capacidade de voluntariado`, async ({ page }) => {
      test.skip(!account, `Conta E2E ${persona} não configurada`)
      if (!account) return
      await gotoAuthenticated(page, account, "/membro")
      await expect(page.getByRole("link", { name: "Voluntariado" }).first()).toBeVisible()
      await page.goto("/membro/voluntariado", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "Minhas escalas" })).toBeVisible()
    })
  })
}

for (const persona of ["ministryLeader", "ministryLeaderVolunteer"] as const) {
  const account = e2e.portalAccounts?.[persona]
  test.describe(`configuracao ministerio ${persona}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } })
    const ministryId = randomUUID()
    let sql: ReturnType<typeof postgres> | undefined
    let companyId: string | undefined
    test.beforeAll(async () => {
      if (!account) return
      if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL necessário para o fixture")
      sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false })
      const [person] = await sql<{ company_id: string; person_id: string | null }[]>`select c.id as company_id,p.person_id from companies c
        join profiles p on p.company_id=c.id and lower(p.email)=lower(${account.email})
        where c.legacy_id=${e2e.companyLegacyId} and c.status='test' and c.active=true`
      if (!person?.person_id) throw new Error("Líder precisa estar vinculado a uma pessoa do tenant de teste")
      companyId = person.company_id
      await sql`insert into ministries(id,company_id,name) values(${ministryId},${companyId},${`Ministério E2E ${ministryId.slice(0, 8)}`})`
      await sql`insert into ministry_memberships(company_id,ministry_id,person_id,role,status)
        values(${companyId},${ministryId},${person.person_id},'leader','active')`
    })
    test.afterAll(async () => {
      if (sql) {
        if (companyId) {
          await sql`delete from automation_events where company_id=${companyId} and context->>'source_id' in
            (select id::text from ministry_memberships where ministry_id=${ministryId} and company_id=${companyId})`
          await sql`delete from ministries where id=${ministryId} and company_id=${companyId}`
        }
        await sql.end({ timeout: 3 })
      }
    })

    test(`${persona} configura somente ministério próprio`, async ({ page }) => {
      test.skip(!account, `Conta E2E ${persona} não configurada`)
      if (!account) return
      await gotoAuthenticated(page, account, "/membro")
      await page.goto("/membro/ministerios", { waitUntil: "domcontentloaded" })
      await page.getByRole("button", { name: "Configurar ministério" }).first().click()
      await expect(page).toHaveURL(/\/membro\/ministerios\/[^/]+/)
      await expect(page.getByRole("tab", { name: "Configurações" })).toHaveAttribute("aria-selected", "true")
      await expect(page.getByRole("button", { name: "Salvar configurações" })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Agenda", exact: true })).toBeVisible()
      await expect(page.getByRole("tab", { name: "Escalas", exact: true })).toBeVisible()
    })
  })
}
