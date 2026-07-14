import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { test } from "node:test"
import postgres from "postgres"

function loadLocalEnv() {
  if (process.env.POSTGRES_URL) return
  if (!existsSync(".env.local")) return
  const content = readFileSync(".env.local", "utf8")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const index = trimmed.indexOf("=")
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const connectionString = process.env.POSTGRES_URL

test("database integration: reading plan steps, finance delete, person links, company name", async (t) => {
  if (!connectionString) {
    t.skip("POSTGRES_URL não configurado")
    return
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })

  try {
    const companies = await sql`
      select id, name, slug, active
      from public.companies
      where active = true
      order by created_at
      limit 1
    `
    assert.ok(companies[0]?.id, "precisa de ao menos uma empresa ativa")
    const companyId = companies[0].id
    assert.ok(companies[0].name.length > 0, "empresa deve ter nome multi-tenant")

    const people = await sql`
      select id, full_name
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at
      limit 1
    `

    const planRows = await sql`
      insert into public.reading_plans (company_id, name, description, status, is_active)
      values (${companyId}, ${`Integração Plano ${Date.now()}`}, 'teste integração', 'draft', true)
      returning id
    `
    const planId = planRows[0].id

    const stepRows = await sql`
      insert into public.reading_plan_steps (company_id, plan_id, day_number, title, content, scripture_ref)
      values (${companyId}, ${planId}, 1, 'Dia 1', 'Conteúdo de teste', 'Jo 1:1')
      returning id, day_number, title
    `
    assert.equal(stepRows[0].day_number, 1)
    assert.equal(stepRows[0].title, "Dia 1")

    const revenueRows = await sql`
      insert into public.revenues (
        company_id, amount, category, description, payment_date, received
      )
      values (${companyId}, 12.34, 'Teste', 'Receita integração', current_date, true)
      returning id
    `
    const revenueId = revenueRows[0].id
    await sql`
      update public.revenues
      set deleted_at = now()
      where id = ${revenueId}
        and company_id = ${companyId}
    `
    const deletedRevenue = await sql`
      select deleted_at
      from public.revenues
      where id = ${revenueId}
    `
    assert.ok(deletedRevenue[0].deleted_at, "receita deve aceitar soft delete")

    if (people[0]?.id) {
      const attendanceRows = await sql`
        insert into public.attendance_records (
          company_id, person_id, person_name, event_type, event_ref_name, occurred_on, status
        )
        values (
          ${companyId}, ${people[0].id}, ${people[0].full_name}, 'service', 'Integração', current_date, 'present'
        )
        returning id, person_id
      `
      assert.equal(attendanceRows[0].person_id, people[0].id)

      const crmRows = await sql`
        insert into public.crm_cards (
          company_id, person_id, person_name, person_phone, person_email, stage, source
        )
        values (
          ${companyId}, ${people[0].id}, ${people[0].full_name}, '', '', 'new', 'integração'
        )
        returning id, person_id
      `
      assert.equal(crmRows[0].person_id, people[0].id)

      await sql`update public.attendance_records set deleted_at = now() where id = ${attendanceRows[0].id}`
      await sql`update public.crm_cards set deleted_at = now() where id = ${crmRows[0].id}`
    }

    const registerTables = await sql`
      select to_regclass('public.profiles') is not null as has_profiles,
             to_regclass('public.companies') is not null as has_companies
    `
    assert.equal(registerTables[0].has_profiles, true)
    assert.equal(registerTables[0].has_companies, true)

    await sql`update public.reading_plan_steps set deleted_at = now() where plan_id = ${planId}`
    await sql`update public.reading_plans set deleted_at = now() where id = ${planId}`
  } finally {
    await sql.end({ timeout: 5 })
  }
})
