import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const connectionString = process.env.POSTGRES_URL

const KID_TABLES = [
  "kid_profiles",
  "kid_guardians",
  "kid_health_profiles",
  "kid_consents",
  "kid_classrooms",
  "kid_classroom_rules",
  "kid_sessions",
  "kid_session_classrooms",
  "kid_staff_assignments",
  "kid_attendances",
  "kid_pickup_credentials",
  "kid_access_events",
  "kid_incidents",
  "kid_messages",
  "kid_lesson_reports",
  "kid_delivery_outbox",
  "kid_settings",
]

const GUARDIAN_READ_TABLES = [
  "kid_profiles",
  "kid_guardians",
  "kid_health_profiles",
  "kid_consents",
  "kid_classrooms",
  "kid_classroom_rules",
  "kid_sessions",
  "kid_session_classrooms",
  "kid_attendances",
  "kid_pickup_credentials",
  "kid_lesson_reports",
]

test("kids foundation: schema, RLS, policies, constraints e registro do módulo", async (t) => {
  if (!connectionString) {
    t.skip("POSTGRES_URL não configurado")
    return
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })
  const cleanup = { personIds: [], kidIds: [], sessionIds: [], profileIds: [], settingsIds: [] }

  try {
    // 1) Tabelas com RLS habilitado
    const tables = await sql`
      select relname, relrowsecurity
      from pg_class
      where relnamespace = 'public'::regnamespace
        and relname = any(${KID_TABLES})
    `
    assert.equal(tables.length, KID_TABLES.length, "todas as tabelas kid_* devem existir")
    for (const table of tables) {
      assert.equal(table.relrowsecurity, true, `RLS deve estar habilitado em ${table.relname}`)
    }

    // 2) Políticas staff + guardian
    const policies = await sql`
      select tablename, policyname, cmd
      from pg_policies
      where schemaname = 'public' and tablename = any(${KID_TABLES})
    `
    for (const table of KID_TABLES) {
      const staff = policies.find((row) => row.tablename === table && row.policyname === `${table} staff access`)
      assert.ok(staff, `política "${table} staff access" deve existir`)
      assert.equal(staff.cmd, "ALL")
    }
    for (const table of GUARDIAN_READ_TABLES) {
      const guardian = policies.find((row) => row.tablename === table && row.policyname === `${table} guardian read`)
      assert.ok(guardian, `política "${table} guardian read" deve existir`)
      assert.equal(guardian.cmd, "SELECT")
    }
    const staffOnly = KID_TABLES.filter((table) => !GUARDIAN_READ_TABLES.includes(table))
    for (const table of staffOnly) {
      const guardian = policies.find((row) => row.tablename === table && row.policyname === `${table} guardian read`)
      assert.equal(guardian, undefined, `${table} não deve ter leitura guardian (dados operacionais/sensíveis)`)
    }

    // 3) Helpers RLS
    const functions = await sql`
      select proname from pg_proc
      where pronamespace = 'public'::regnamespace
        and proname in ('kids_current_profile_id', 'kids_is_staff', 'kids_is_guardian', 'kids_guardian_kid_ids')
    `
    assert.equal(functions.length, 4, "helpers kids_* devem existir")

    // 4) Registro do módulo: registrado, mas fora de planos e empresas (ativação manual)
    const moduleRows = await sql`select id, route, menu_group, required_permission, active from public.system_modules where id = 'kids'`
    assert.equal(moduleRows.length, 1)
    assert.equal(moduleRows[0].route, "/kids")
    assert.equal(moduleRows[0].menu_group, "Cuidar")
    assert.equal(moduleRows[0].required_permission, "kids.view")
    const planRows = await sql`select * from public.plan_modules where module_id = 'kids'`
    assert.equal(planRows.length, 0, "kids não deve estar em nenhum plano por padrão")
    const kidsMigration = readFileSync("supabase/migrations/20260717120000_kids_module.sql", "utf8")
    assert.doesNotMatch(
      kidsMigration,
      /insert\s+into\s+public\.company_modules[\s\S]*?['"]kids['"]/i,
      "migration não deve ativar Kids automaticamente em empresas",
    )

    // 5) Papel guardian aceito pelo check constraint de profiles
    const companies = await sql`select id from public.companies where active = true order by created_at limit 1`
    assert.ok(companies[0]?.id, "precisa de ao menos uma empresa ativa")
    const companyId = companies[0].id

    const guardianEmail = `kids-guardian-${Date.now()}@teste.local`
    const guardianProfiles = await sql`
      insert into public.profiles (company_id, name, email, role, active)
      values (${companyId}, 'Responsável Teste Kids', ${guardianEmail}, 'guardian', true)
      returning id
    `
    cleanup.profileIds.push(guardianProfiles[0].id)

    // 6) Fluxo funcional com constraints do domínio
    const stamp = Date.now()
    const personRows = await sql`
      insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
      values (${companyId}, 'Crianca', 'Kids', ${'Crianca Kids ' + stamp}, '2021-05-10', 'active', 'member', true)
      returning id
    `
    const personId = personRows[0].id
    cleanup.personIds.push(personId)

    const kidRows = await sql`
      insert into public.kid_profiles (company_id, person_id, is_visitor)
      values (${companyId}, ${personId}, false)
      returning id
    `
    const kidId = kidRows[0].id
    cleanup.kidIds.push(kidId)

    // 6a) 1:1 — segunda kid_profile ativa para a mesma pessoa deve falhar
    await assert.rejects(
      sql`insert into public.kid_profiles (company_id, person_id) values (${companyId}, ${personId})`,
      /kid_profiles_person_active_unique_idx/,
    )

    // 6b) consentimentos: um vigente por tipo
    await sql`
      insert into public.kid_consents (company_id, kid_id, consent_type, version, status)
      values (${companyId}, ${kidId}, 'data_processing', '1.0', 'granted')
    `
    await assert.rejects(
      sql`insert into public.kid_consents (company_id, kid_id, consent_type, version, status) values (${companyId}, ${kidId}, 'data_processing', '1.1', 'granted')`,
      /kid_consents_active_type_unique_idx/,
    )
    await sql`
      update public.kid_consents set status = 'revoked', revoked_at = now()
      where kid_id = ${kidId} and consent_type = 'data_processing' and status = 'granted'
    `
    await sql`
      insert into public.kid_consents (company_id, kid_id, consent_type, version, status)
      values (${companyId}, ${kidId}, 'data_processing', '1.1', 'granted')
    `

    // 6c) sessão + um check-in ativo por criança por sessão
    const sessionRows = await sql`
      insert into public.kid_sessions (company_id, title, status, starts_at)
      values (${companyId}, ${'Sessão Kids Teste ' + stamp}, 'open', now())
      returning id
    `
    const sessionId = sessionRows[0].id
    cleanup.sessionIds.push(sessionId)

    const attendanceRows = await sql`
      insert into public.kid_attendances (company_id, session_id, kid_id, status)
      values (${companyId}, ${sessionId}, ${kidId}, 'checked_in')
      returning id
    `
    const attendanceId = attendanceRows[0].id
    await assert.rejects(
      sql`insert into public.kid_attendances (company_id, session_id, kid_id, status) values (${companyId}, ${sessionId}, ${kidId}, 'checked_in')`,
      /kid_attendances_active_unique_idx/,
      "segundo check-in ativo deve ser bloqueado",
    )
    await sql`update public.kid_attendances set status = 'checked_out', checked_out_at = now() where id = ${attendanceId}`
    await sql`
      insert into public.kid_attendances (company_id, session_id, kid_id, status)
      values (${companyId}, ${sessionId}, ${kidId}, 'checked_in')
    `

    // 6d) credencial: uma ativa por atendimento + hashes de 64 chars
    await sql`
      insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, token_hash, pin_hash, pin_expires_at)
      values (${companyId}, ${attendanceId}, ${kidId}, ${"a".repeat(64)}, ${"b".repeat(64)}, now() + interval '30 minutes')
    `
    await assert.rejects(
      sql`insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, token_hash, pin_hash, pin_expires_at) values (${companyId}, ${attendanceId}, ${kidId}, ${"c".repeat(64)}, ${"d".repeat(64)}, now() + interval '30 minutes')`,
      /kid_pickup_credentials_active_unique_idx/,
    )
    await assert.rejects(
      sql`insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, token_hash, pin_hash, pin_expires_at, status) values (${companyId}, ${attendanceId}, ${kidId}, 'curto', ${"e".repeat(64)}, now() + interval '30 minutes', 'revoked')`,
      /kid_pickup_credentials_token_hash_check/,
    )

    // 6e) configurações: um padrão por empresa e um por congregação
    const settingsRows = await sql`
      insert into public.kid_settings (company_id)
      values (${companyId})
      returning id
    `
    cleanup.settingsIds.push(settingsRows[0].id)
    await assert.rejects(
      sql`insert into public.kid_settings (company_id) values (${companyId})`,
      /kid_settings_company_default_unique_idx/,
    )

    // 6f) trilha de segurança aceita apenas tipos conhecidos
    await assert.rejects(
      sql`insert into public.kid_access_events (company_id, event_type) values (${companyId}, 'tipo_invalido')`,
      /kid_access_events_type_check/,
    )
  } finally {
    // limpeza completa dos dados de teste (hard delete)
    if (cleanup.sessionIds.length > 0) {
      await sql`delete from public.kid_attendances where session_id = any(${cleanup.sessionIds}::uuid[])`
      await sql`delete from public.kid_sessions where id = any(${cleanup.sessionIds}::uuid[])`
    }
    if (cleanup.kidIds.length > 0) {
      await sql`delete from public.kid_pickup_credentials where kid_id = any(${cleanup.kidIds}::uuid[])`
      await sql`delete from public.kid_consents where kid_id = any(${cleanup.kidIds}::uuid[])`
      await sql`delete from public.kid_health_profiles where kid_id = any(${cleanup.kidIds}::uuid[])`
      await sql`delete from public.kid_guardians where kid_id = any(${cleanup.kidIds}::uuid[])`
      await sql`delete from public.kid_profiles where id = any(${cleanup.kidIds}::uuid[])`
    }
    if (cleanup.settingsIds.length > 0) {
      await sql`delete from public.kid_settings where id = any(${cleanup.settingsIds}::uuid[])`
    }
    if (cleanup.profileIds.length > 0) {
      await sql`delete from public.profiles where id = any(${cleanup.profileIds}::uuid[])`
    }
    if (cleanup.personIds.length > 0) {
      await sql`delete from public.people where id = any(${cleanup.personIds}::uuid[])`
    }
    await sql.end()
  }
})

test("kids actions: padrões de upsert usados pelas server actions", async (t) => {
  if (!connectionString) {
    t.skip("POSTGRES_URL não configurado")
    return
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })
  const stamp = Date.now()
  let companyId = null
  let personId = null
  let guardianPersonId = null
  let kidId = null

  try {
    const companies = await sql`select id from public.companies where active = true order by created_at limit 1`
    companyId = companies[0]?.id
    assert.ok(companyId, "precisa de ao menos uma empresa ativa")

    personId = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
        values (${companyId}, 'Upsert', 'Kids', ${'Upsert Kids ' + stamp}, '2020-01-15', 'active', 'member', true)
        returning id
      `
    )[0].id
    guardianPersonId = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, phone, status, person_type, is_active)
        values (${companyId}, 'Resp', 'Upsert', ${'Resp Upsert ' + stamp}, '11999990000', 'active', 'attendee', true)
        returning id
      `
    )[0].id

    // upsert de kid_profiles (insert → conflict → mesmo id)
    const inserted = await sql`
      insert into public.kid_profiles (company_id, person_id, status, is_visitor, notes)
      values (${companyId}, ${personId}, 'active', false, 'primeiro')
      on conflict (person_id) where deleted_at is null
      do update set is_visitor = excluded.is_visitor, notes = excluded.notes
      returning id
    `
    kidId = inserted[0].id
    const upserted = await sql`
      insert into public.kid_profiles (company_id, person_id, status, is_visitor, notes)
      values (${companyId}, ${personId}, 'active', true, 'segundo')
      on conflict (person_id) where deleted_at is null
      do update set is_visitor = excluded.is_visitor, notes = excluded.notes
      returning id
    `
    assert.equal(upserted[0].id, kidId, "upsert deve retornar o mesmo registro")
    const kidCheck = await sql`select is_visitor, notes from public.kid_profiles where id = ${kidId}`
    assert.equal(kidCheck[0].is_visitor, true)
    assert.equal(kidCheck[0].notes, "segundo")

    // upsert de responsável (insert → conflict → mantém vínculo único)
    const link = { relationship: "mother", is_primary: true }
    await sql`
      insert into public.kid_guardians (company_id, kid_id, person_id, relationship, is_primary)
      values (${companyId}, ${kidId}, ${guardianPersonId}, ${link.relationship}, ${link.is_primary})
      on conflict (kid_id, person_id) where deleted_at is null
      do update set relationship = excluded.relationship, is_primary = excluded.is_primary
    `
    await sql`
      insert into public.kid_guardians (company_id, kid_id, person_id, relationship, is_primary)
      values (${companyId}, ${kidId}, ${guardianPersonId}, 'guardian', false)
      on conflict (kid_id, person_id) where deleted_at is null
      do update set relationship = excluded.relationship, is_primary = excluded.is_primary
    `
    const guardianRows = await sql`
      select relationship, is_primary from public.kid_guardians
      where kid_id = ${kidId} and person_id = ${guardianPersonId} and deleted_at is null
    `
    assert.equal(guardianRows.length, 1)
    assert.equal(guardianRows[0].relationship, "guardian")

    // limpeza de vínculos com array tipado (<> all ($1::uuid[]))
    await sql`
      update public.kid_guardians
      set deleted_at = now()
      where kid_id = ${kidId}
        and company_id = ${companyId}
        and deleted_at is null
        and person_id <> all (${[randomUUID()]}::uuid[])
    `
    const afterCleanup = await sql`
      select count(*)::int as total from public.kid_guardians where kid_id = ${kidId} and deleted_at is null
    `
    assert.equal(afterCleanup[0].total, 0)

    // upsert de saúde (insert → conflict → atualiza indicadores)
    await sql`
      insert into public.kid_health_profiles (company_id, kid_id, has_allergy, details_encrypted)
      values (${companyId}, ${kidId}, false, '')
      on conflict (kid_id) where deleted_at is null
      do update set has_allergy = excluded.has_allergy, details_encrypted = excluded.details_encrypted
    `
    await sql`
      insert into public.kid_health_profiles (company_id, kid_id, has_allergy, details_encrypted)
      values (${companyId}, ${kidId}, true, 'v1.payload')
      on conflict (kid_id) where deleted_at is null
      do update set has_allergy = excluded.has_allergy, details_encrypted = excluded.details_encrypted
    `
    const healthRows = await sql`
      select has_allergy, details_encrypted from public.kid_health_profiles
      where kid_id = ${kidId} and deleted_at is null
    `
    assert.equal(healthRows.length, 1)
    assert.equal(healthRows[0].has_allergy, true)
    assert.equal(healthRows[0].details_encrypted, "v1.payload")
  } finally {
    if (kidId) {
      await sql`delete from public.kid_health_profiles where kid_id = ${kidId}`
      await sql`delete from public.kid_guardians where kid_id = ${kidId}`
      await sql`delete from public.kid_profiles where id = ${kidId}`
    }
    if (personId) await sql`delete from public.people where id = ${personId}`
    if (guardianPersonId) await sql`delete from public.people where id = ${guardianPersonId}`
    await sql.end()
  }
})
