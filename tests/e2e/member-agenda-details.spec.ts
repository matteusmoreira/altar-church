import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { expect, test } from "@playwright/test"
import { gotoAuthenticated } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()
const eventId = randomUUID()
const title = `Agenda E2E ${eventId.slice(0, 8)}`
let sql: ReturnType<typeof postgres>
let companyId: string

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeAll(async () => {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL necessário para o fixture isolado")
  sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false })
  const [company] = await sql`select id from companies where legacy_id=${e2e.companyLegacyId} and status='test' and active=true`
  if (!company) throw new Error("Somente tenant de teste é permitido")
  companyId = company.id
  const [flows] = await sql`select count(*)::int as total from automation_flows where company_id=${companyId} and status='published'`
  if (flows.total) throw new Error("Tenant de teste deve estar sem automações publicadas")
  await sql`insert into events(id,company_id,title,description,type,starts_at,ends_at,location,registration_enabled,max_capacity)
    values(${eventId},${companyId},${title},'Instruções completas para os participantes.','meeting',now()+interval '1 hour',now()+interval '2 hours','Sala de teste',true,0)`
})
test.afterAll(async () => {
  if (sql) {
    if (companyId) {
      await sql`delete from automation_events where company_id=${companyId} and context->>'event_id'=${eventId}`
      await sql`delete from events where id=${eventId} and company_id=${companyId}`
    }
    await sql.end({ timeout: 3 })
  }
})

test("member opens responsive details and persists confirmation, cancellation and reconfirmation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await gotoAuthenticated(page, e2e.accounts.member, "/membro/agenda")
  await page.getByRole("button", { name: `Ver detalhes de ${title}` }).click()
  const dialog = page.getByRole("dialog", { name: title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText("Instruções completas para os participantes.")).toBeVisible()
  await expect(dialog.getByText("Sala de teste")).toBeVisible()
  await expect(dialog.getByText("Nenhuma escala publicada para esta atividade.")).toBeVisible()
  await expect(dialog.getByText(/Sem limite de vagas/)).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360)
  await dialog.getByRole("button", { name: "Confirmar presença", exact: true }).click()
  await expect(dialog.getByText("Sua presença está confirmada.")).toBeVisible()
  expect((await sql`select status from member_event_rsvps where event_id=${eventId}`)[0].status).toBe("going")
  await dialog.getByRole("button", { name: "Cancelar presença", exact: true }).click()
  await expect(dialog.getByText("Sua presença ainda não está confirmada.")).toBeVisible()
  await dialog.getByRole("button", { name: "Confirmar presença", exact: true }).click()
  await expect(dialog.getByText("Sua presença está confirmada.")).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: `Ver detalhes de ${title}` }).click()
  await expect(page.getByRole("dialog", { name: title }).getByText("Sua presença está confirmada.")).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.getByRole("dialog", { name: title })).toBeVisible()
})
