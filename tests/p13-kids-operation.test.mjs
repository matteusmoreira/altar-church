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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

loadLocalEnv()

const connectionString = process.env.POSTGRES_URL

test("kids operation: sessão, escala única, rotação de credencial e transições de checkout", async (t) => {
  if (!connectionString) {
    t.skip("POSTGRES_URL não configurado")
    return
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })
  const stamp = Date.now()
  let companyId = null
  let personId = null
  let kidId = null
  let profileId = null
  let classroomId = null
  let sessionId = null

  try {
    companyId = (await sql`select id from public.companies where active = true order by created_at limit 1`)[0]?.id
    assert.ok(companyId, "precisa de ao menos uma empresa ativa")

    // --- fixtures: criança, sala, perfil de voluntário, sessão aberta com a sala
    personId = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
        values (${companyId}, 'Operacao', 'Kids', ${'Operacao Kids ' + stamp}, '2022-03-05', 'active', 'member', true)
        returning id
      `
    )[0].id
    kidId = (
      await sql`
        insert into public.kid_profiles (company_id, person_id)
        values (${companyId}, ${personId})
        returning id
      `
    )[0].id
    profileId = (
      await sql`
        insert into public.profiles (company_id, name, email, role, active)
        values (${companyId}, 'Voluntario Kids', ${'kids-vol-' + stamp + '@teste.local'}, 'volunteer', true)
        returning id
      `
    )[0].id
    classroomId = (
      await sql`
        insert into public.kid_classrooms (company_id, name, min_age_months, max_age_months, capacity)
        values (${companyId}, ${'Sala Op ' + stamp}, 24, 72, 2)
        returning id
      `
    )[0].id
    sessionId = (
      await sql`
        insert into public.kid_sessions (company_id, title, status, starts_at)
        values (${companyId}, ${'Sessão Op ' + stamp}, 'open', now())
        returning id
      `
    )[0].id
    const sessionClassroomId = (
      await sql`
        insert into public.kid_session_classrooms (company_id, session_id, classroom_id)
        values (${companyId}, ${sessionId}, ${classroomId})
        returning id
      `
    )[0].id

    // --- 1) escala única: mesmo voluntário + sala (nula ou não) não duplica
    await sql`
      insert into public.kid_staff_assignments (company_id, session_id, session_classroom_id, profile_id, assignment_role)
      values (${companyId}, ${sessionId}, ${sessionClassroomId}, ${profileId}, 'teacher')
    `
    await assert.rejects(
      sql`insert into public.kid_staff_assignments (company_id, session_id, session_classroom_id, profile_id, assignment_role) values (${companyId}, ${sessionId}, ${sessionClassroomId}, ${profileId}, 'helper')`,
      /kid_staff_assignments_unique_idx/,
    )
    await sql`
      insert into public.kid_staff_assignments (company_id, session_id, session_classroom_id, profile_id, assignment_role)
      values (${companyId}, ${sessionId}, null, ${profileId}, 'reception')
    `
    await assert.rejects(
      sql`insert into public.kid_staff_assignments (company_id, session_id, session_classroom_id, profile_id, assignment_role) values (${companyId}, ${sessionId}, null, ${profileId}, 'leader')`,
      /kid_staff_assignments_unique_idx/,
      "duplicidade com sala nula também deve ser bloqueada",
    )

    // --- 2) check-in + credencial; rotação mantém exatamente uma ativa
    const attendanceId = (
      await sql`
        insert into public.kid_attendances (company_id, session_id, session_classroom_id, classroom_name, kid_id, status)
        values (${companyId}, ${sessionId}, ${sessionClassroomId}, 'Sala Op', ${kidId}, 'checked_in')
        returning id
      `
    )[0].id
    const credentialId = (
      await sql`
        insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, token_hash, pin_hash, pin_expires_at)
        values (${companyId}, ${attendanceId}, ${kidId}, ${"1".repeat(64)}, ${"2".repeat(64)}, now() + interval '30 minutes')
        returning id
      `
    )[0].id

    // padrão da rotação: revoga a ativa e insere nova
    await sql`update public.kid_pickup_credentials set status = 'revoked', revoked_at = now() where id = ${credentialId}`
    const rotatedId = (
      await sql`
        insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, token_hash, pin_hash, pin_expires_at, rotation_count)
        values (${companyId}, ${attendanceId}, ${kidId}, ${"3".repeat(64)}, ${"4".repeat(64)}, now() + interval '30 minutes', 1)
        returning id
      `
    )[0].id
    const activeCount = (
      await sql`
        select count(*)::int as count from public.kid_pickup_credentials
        where attendance_id = ${attendanceId} and status = 'active'
      `
    )[0].count
    assert.equal(activeCount, 1, "apenas uma credencial ativa após rotação")

    // --- 3) transição de status: solicitação de retirada → checkout
    await sql`
      update public.kid_attendances
      set status = 'checkout_requested', checkout_requested_at = now()
      where id = ${attendanceId} and status = 'checked_in'
    `
    const requested = (await sql`select status from public.kid_attendances where id = ${attendanceId}`)[0]
    assert.equal(requested.status, "checkout_requested")

    // checkout: credencial usada + revoga qualquer outra ativa
    await sql`
      update public.kid_attendances
      set status = 'checked_out', checked_out_at = now()
      where id = ${attendanceId} and status in ('checked_in', 'checkout_requested')
    `
    await sql`update public.kid_pickup_credentials set status = 'used', used_at = now() where id = ${rotatedId}`
    await sql`update public.kid_pickup_credentials set status = 'revoked', revoked_at = now() where attendance_id = ${attendanceId} and status = 'active'`

    // segunda tentativa de checkout não encontra presença válida (guarda de corrida)
    const secondTry = await sql`
      update public.kid_attendances
      set status = 'checked_out', checked_out_at = now()
      where id = ${attendanceId} and status in ('checked_in', 'checkout_requested')
      returning id
    `
    assert.equal(secondTry.length, 0, "segunda tentativa de checkout não deve afetar linhas")

    // credencial usada não pode ser reusada como ativa
    const reusable = await sql`
      select id from public.kid_pickup_credentials
      where attendance_id = ${attendanceId} and status = 'active'
    `
    assert.equal(reusable.length, 0, "nenhuma credencial ativa após checkout")

    // --- 4) contagem de capacidade espelha a regra da action
    const kid2Person = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
        values (${companyId}, 'Operacao2', 'Kids', ${'Operacao2 Kids ' + stamp}, '2021-11-20', 'active', 'member', true)
        returning id
      `
    )[0].id
    const kid2 = (
      await sql`
        insert into public.kid_profiles (company_id, person_id)
        values (${companyId}, ${kid2Person})
        returning id
      `
    )[0].id
    await sql`
      insert into public.kid_attendances (company_id, session_id, session_classroom_id, classroom_name, kid_id, status)
      values (${companyId}, ${sessionId}, ${sessionClassroomId}, 'Sala Op', ${kid2}, 'checked_in')
    `
    const occupied = (
      await sql`
        select count(*)::int as count from public.kid_attendances
        where session_classroom_id = ${sessionClassroomId} and status in ('checked_in', 'checkout_requested')
      `
    )[0].count
    assert.equal(occupied, 1, "criança retirada não conta na ocupação")
    const capacity = 2
    assert.ok(occupied < capacity, "sala com vaga após checkout")

    // limpeza da segunda criança
    await sql`delete from public.kid_attendances where kid_id = ${kid2}`
    await sql`delete from public.kid_profiles where id = ${kid2}`
    await sql`delete from public.people where id = ${kid2Person}`
  } finally {
    if (sessionId) {
      await sql`delete from public.kid_access_events where session_id = ${sessionId}`
      await sql`delete from public.kid_pickup_credentials where attendance_id in (select id from public.kid_attendances where session_id = ${sessionId})`
      await sql`delete from public.kid_attendances where session_id = ${sessionId}`
      await sql`delete from public.kid_staff_assignments where session_id = ${sessionId}`
      await sql`delete from public.kid_session_classrooms where session_id = ${sessionId}`
      await sql`delete from public.kid_sessions where id = ${sessionId}`
    }
    if (classroomId) await sql`delete from public.kid_classrooms where id = ${classroomId}`
    if (profileId) await sql`delete from public.profiles where id = ${profileId}`
    if (kidId) {
      await sql`delete from public.kid_profiles where id = ${kidId}`
    }
    if (personId) await sql`delete from public.people where id = ${personId}`
    await sql.end()
  }
})
