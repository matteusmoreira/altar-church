import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import { chromium, expect } from "@playwright/test"
import postgres from "postgres"

const baseURL = process.env.E2E_BASE_URL || "http://localhost:3107"
const source = await fs.readFile(process.env.E2E_ACCOUNTS_DOC || "docs/testing/e2e-accounts.local.md", "utf8")
const accounts = JSON.parse(source.match(/```json\s*([\s\S]*?)```/)[1])
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false, max_pipeline: 1 })
const browser = await chromium.launch({ channel: "chrome", headless: true })
const prefix = `e2e-slugs-${randomUUID().slice(0, 8)}`
const fixtures = []
let companyId
async function login(account) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  await page.goto("/login")
  await page.locator('[data-testid="login-form"][data-ready="true"]').waitFor()
  await page.getByLabel("E-mail").fill(account.email)
  await page.locator("#password").fill(account.password)
  await page.getByTestId("login-submit").click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 })
  return page
}
async function check(page, route, expectedSlug = route.slug) {
  const response = await page.goto(`${route.prefix}/${route.id}?tab=teste&tag=a&tag=b`, { waitUntil: "domcontentloaded" })
  assert.ok(response && response.status() < 400, `Failed ${route.kind}`)
  await expect(page).toHaveURL(new RegExp(`${route.prefix}/${expectedSlug}\\?tab=teste&tag=a&tag=b$`))
  await expect(page.locator("main").first()).toBeVisible()
  await expect(page.getByText("Algo deu errado", { exact: false })).toHaveCount(0)
  await expect(page.getByText("Application error", { exact: false })).toHaveCount(0)
  await expect(page.locator('[data-nextjs-dialog-overlay]')).toHaveCount(0)
  console.log(`Verified canonical route: ${route.kind}`)
}
try {
  const [company] = await sql`select id from public.companies where legacy_id=${accounts.companyLegacyId} and status='test'`
  if (!company) throw new Error("Browser verification requires the designated test church")
  companyId = company.id
  const admin = await login(accounts.accounts.admin)
  await admin.goto("/ministerios")
  await admin.getByRole("button", { name: "Novo Ministério", exact: true }).click()
  await admin.getByPlaceholder("Nome do ministério").fill(prefix)
  await admin.getByRole("button", { name: "Criar ministério", exact: true }).click()
  await expect.poll(async () => (await sql`select count(*)::int n from public.ministries where company_id=${companyId} and name=${prefix}`)[0].n,
    { timeout: 45_000 }).toBe(1)
  const [ministry] = await sql`select id,slug from public.ministries where company_id=${companyId} and name=${prefix}`
  fixtures.push({ table: "ministries", id: ministry.id })
  await check(admin, { ...ministry, prefix: "/ministerios", kind: "ministry created through UI" })

  const seeded = await sql.begin(async tx => {
    await tx`select set_config('app.automation_run_id',gen_random_uuid()::text,true)`
    const rows = []
    const [person] = await tx`insert into public.people(company_id,first_name,full_name) values(${companyId},${prefix},${`João ${prefix}`}) returning id,slug`
    rows.push({ ...person, table: "people", prefix: "/pessoas", kind: "people" })
    const [event] = await tx`insert into public.events(company_id,title,starts_at,status,is_public) values(${companyId},${prefix},now()+interval '1 day','draft',false) returning id,slug`
    rows.push({ ...event, table: "events", prefix: "/eventos", kind: "events" })
    const [form] = await tx`insert into public.forms(company_id,title) values(${companyId},${prefix}) returning id,slug`
    rows.push({ ...form, table: "forms", prefix: "/formularios", kind: "forms" })
    const [notification] = await tx`insert into public.notifications(company_id,title,content,status) values(${companyId},${prefix},'Teste de rotas, sem destinatários','draft') returning id,slug`
    rows.push({ ...notification, table: "notifications", prefix: "/notificacao", kind: "notifications" })
    const [classroom] = await tx`insert into public.kid_classrooms(company_id,name) values(${companyId},${prefix}) returning id`
    const [session] = await tx`insert into public.kid_sessions(company_id,title,starts_at) values(${companyId},${prefix},now()) returning id`
    const [room] = await tx`insert into public.kid_session_classrooms(company_id,classroom_id,session_id) values(${companyId},${classroom.id},${session.id}) returning id,slug`
    rows.push({ ...room, table: "kid_session_classrooms", prefix: "/kids/salas", kind: "Kids session room" })
    rows.push({ ...session, table: "kid_sessions" }, { ...classroom, table: "kid_classrooms" })
    return rows
  })
  fixtures.push(...seeded)
  for (const route of seeded.filter(row => row.prefix)) await check(admin, route)

  // Explicit edits preserve aliases; name-only edits leave the slug unchanged.
  await admin.goto(`/ministerios/${ministry.slug}`)
  await admin.getByRole("tab", { name: "Configurações", exact: true }).click()
  await admin.getByLabel("Nome do ministério", { exact: true }).fill(`${prefix} renomeado`)
  await admin.getByRole("button", { name: "Salvar configurações", exact: true }).click()
  await expect.poll(async () => (await sql`select name from public.ministries where id=${ministry.id}`)[0].name).toBe(`${prefix} renomeado`)
  assert.equal((await sql`select slug from public.ministries where id=${ministry.id}`)[0].slug, ministry.slug)
  await check(admin, { ...ministry, prefix: "/ministerios", kind: "stable slug after rename" })
  await admin.getByRole("tab", { name: "Configurações", exact: true }).click()
  await admin.getByLabel("Link amigável (slug)", { exact: true }).fill(`${prefix}-alterado`)
  await admin.getByRole("button", { name: "Salvar configurações", exact: true }).click()
  await expect.poll(async () => (await sql`select slug from public.ministries where id=${ministry.id}`)[0].slug).toBe(`${prefix}-alterado`)
  const [updated] = await sql`select id,slug from public.ministries where id=${ministry.id} and company_id=${companyId}`
  await check(admin, { id: ministry.slug, prefix: "/ministerios", kind: "historical ministry slug" }, updated.slug)

  const [member] = await sql`select person.id from public.profiles profile join public.people person
    on person.company_id=profile.company_id and (person.profile_id=profile.id or person.id=profile.person_id)
    where profile.company_id=${companyId} and lower(profile.email)=lower(${accounts.accounts.member.email}) and person.deleted_at is null limit 1`
  if (!member) throw new Error("Test member identity missing")
  await sql.begin(async tx => {
    await tx`select set_config('app.automation_run_id',gen_random_uuid()::text,true)`
    await tx`insert into public.ministry_memberships(company_id,ministry_id,person_id,role,status)
      values(${companyId},${ministry.id},${member.id},'leader','active')`
  })
  const memberPage = await login(accounts.accounts.member)
  await check(memberPage, { ...updated, prefix: "/membro/ministerios", kind: "member ministry portal" })
  await check(memberPage, { id: ministry.slug, prefix: "/membro/ministerios", kind: "historical member portal slug" }, updated.slug)
  const foreign = await sql`select id from public.people where company_id<>${companyId} and deleted_at is null limit 1`
  if (foreign[0]) {
    await admin.goto(`/pessoas/${foreign[0].id}`)
    // Next may stream the shell with HTTP 200 before rendering notFound().
    await expect(admin.getByRole("heading", { name: "404", exact: true })).toBeVisible()
    assert.equal(new URL(admin.url()).pathname, `/pessoas/${foreign[0].id}`)
    console.log("Verified denial of another church's UUID")
  }
  const [publicEvent] = await sql`select e.public_token,e.public_slug,c.slug as company_slug from public.events e
    join public.companies c on c.id=e.company_id and c.active and c.status='active'
    where e.is_public and e.status='published' and e.deleted_at is null limit 1`
  if (publicEvent) {
    const publicPage = await (await browser.newContext({ baseURL })).newPage()
    const publicPath = `/eventos/publico/${publicEvent.company_slug}/${publicEvent.public_slug}`
    assert.equal((await publicPage.goto(publicPath)).status(), 200)
    assert.equal((await publicPage.goto(`/eventos/publico/${publicEvent.public_token}?origem=teste`)).status(), 200)
    await expect(publicPage).toHaveURL(`${baseURL}${publicPath}?origem=teste`)
    await publicPage.goto(`${publicPath}-inexistente`)
    await expect(publicPage.getByRole("heading", { name: "404", exact: true })).toBeVisible()
    console.log("Verified public event slug, legacy token redirect and missing event")
  }
  console.log("Authenticated friendly slug verification passed")
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  try {
    await sql.begin(async tx => {
      await tx`select set_config('app.automation_run_id',gen_random_uuid()::text,true)`
      for (const row of [...fixtures].reverse()) {
        if (row.table === "ministries") await tx`delete from public.ministry_memberships where company_id=${companyId} and ministry_id=${row.id}`
        await tx.unsafe(`delete from public.${row.table} where id=$1 and company_id=$2`, [row.id, companyId])
      }
    })
  } finally { await browser.close(); await sql.end() }
}
