import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
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

test("kids portal: bootstrap guardian, auto-vínculo, rate limit, escopo e retirada", async (t) => {
  if (!connectionString) {
    t.skip("POSTGRES_URL não configurado")
    return
  }

  const sql = postgres(connectionString, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 15 })
  const stamp = Date.now()
  const email = `kids-portal-${stamp}@teste.local`
  let companyId = null
  let guardianPersonId = null
  let childPersonId = null
  let kidId = null
  let profileId = null
  let sessionId = null
  let guardianLinkId = null
  let enabledModule = false

  try {
    companyId = (await sql`select id from public.companies where active = true order by created_at limit 1`)[0]?.id
    assert.ok(companyId, "precisa de ao menos uma empresa ativa")

    // --- 1) rate limit: upsert incrementa na mesma janela
    const keyHash = createHash("sha256").update(`kids:${companyId}:teste-${stamp}`).digest("hex")
    const first = await sql`
      insert into public.public_registration_rate_limits (company_id, ip_hash, window_start, submission_count)
      values (${companyId}, ${keyHash}, date_trunc('hour', now()), 1)
      on conflict (company_id, ip_hash, window_start)
      do update set submission_count = public.public_registration_rate_limits.submission_count + 1
      returning submission_count
    `
    const second = await sql`
      insert into public.public_registration_rate_limits (company_id, ip_hash, window_start, submission_count)
      values (${companyId}, ${keyHash}, date_trunc('hour', now()), 1)
      on conflict (company_id, ip_hash, window_start)
      do update set submission_count = public.public_registration_rate_limits.submission_count + 1
      returning submission_count
    `
    assert.equal(Number(first[0].submission_count), 1)
    assert.equal(Number(second[0].submission_count), 2, "mesma janela incrementa o contador")
    await sql`delete from public.public_registration_rate_limits where company_id = ${companyId} and ip_hash = ${keyHash}`

    // --- 2) bootstrap: vínculo existe antes do login (profile_id nulo)
    guardianPersonId = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, email, phone, status, person_type, is_active)
        values (${companyId}, 'Portal', 'Responsavel', ${'Portal Responsavel ' + stamp}, ${email}, '11988880000', 'active', 'attendee', true)
        returning id
      `
    )[0].id
    childPersonId = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
        values (${companyId}, 'PortalKid', 'Filho', ${'PortalKid Filho ' + stamp}, '2020-08-12', 'active', 'member', true)
        returning id
      `
    )[0].id
    kidId = (
      await sql`
        insert into public.kid_profiles (company_id, person_id, is_visitor)
        values (${companyId}, ${childPersonId}, false)
        returning id
      `
    )[0].id
    guardianLinkId = (await sql`
      insert into public.kid_guardians (company_id, kid_id, person_id, relationship, is_primary, can_checkout)
      values (${companyId}, ${kidId}, ${guardianPersonId}, 'mother', true, true)
      returning id
    `)[0].id

    // primeiro login OTP: cria perfil guardian (como o bootstrap da portal.ts)
    profileId = (
      await sql`
        insert into public.profiles (company_id, name, email, role, active)
        values (${companyId}, ${'Portal Responsavel ' + stamp}, ${email}, 'guardian', true)
        returning id
      `
    )[0].id

    // auto-vínculo por e-mail (mesma regra da autoLinkGuardian)
    await sql`
      update public.kid_guardians guardian
      set profile_id = ${profileId}
      from public.people person
      where person.id = guardian.person_id
        and guardian.profile_id is null
        and guardian.deleted_at is null
        and person.deleted_at is null
        and person.email is not null
        and lower(person.email) = lower(${email})
    `
    const linked = await sql`
      select profile_id from public.kid_guardians where kid_id = ${kidId} and person_id = ${guardianPersonId}
    `
    assert.equal(linked[0].profile_id, profileId, "vínculo passa a apontar para a conta do responsável")

    // backlink people.profile_id
    await sql`
      update public.people person
      set profile_id = ${profileId}
      where person.deleted_at is null
        and person.profile_id is null
        and person.email is not null
        and lower(person.email) = lower(${email})
        and not exists (
          select 1 from public.people other
          where other.profile_id = ${profileId} and other.deleted_at is null and other.id <> person.id
        )
    `
    const backlink = await sql`select profile_id from public.people where id = ${guardianPersonId}`
    assert.equal(backlink[0].profile_id, profileId)

    // --- 3) escopo: consulta de filhos por profile_id retorna somente os próprios
    const otherChildPerson = (
      await sql`
        insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
        values (${companyId}, 'Outra', 'Crianca', ${'Outra Crianca ' + stamp}, '2019-01-01', 'active', 'member', true)
        returning id
      `
    )[0].id
    const otherKidId = (
      await sql`
        insert into public.kid_profiles (company_id, person_id)
        values (${companyId}, ${otherChildPerson})
        returning id
      `
    )[0].id
    const scoped = await sql`
      select guardian.kid_id from public.kid_guardians guardian
      where guardian.profile_id = ${profileId} and guardian.deleted_at is null
    `
    assert.deepEqual(scoped.map((row) => row.kid_id), [kidId], "somente o filho vinculado é visível")
    await sql`delete from public.kid_profiles where id = ${otherKidId}`
    await sql`delete from public.people where id = ${otherChildPerson}`

    // --- 4) retirada pelo portal: solicitação + rotação de credencial
    sessionId = (
      await sql`
        insert into public.kid_sessions (company_id, title, status, starts_at)
        values (${companyId}, ${'Sessão Portal ' + stamp}, 'open', now())
        returning id
      `
    )[0].id
    const attendanceId = (
      await sql`
        insert into public.kid_attendances (company_id, session_id, kid_id, status)
        values (${companyId}, ${sessionId}, ${kidId}, 'checked_in')
        returning id
      `
    )[0].id
    await sql`
      insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, guardian_id, token_hash, pin_hash, pin_expires_at)
      values (${companyId}, ${attendanceId}, ${kidId}, ${guardianLinkId}, ${"5".repeat(64)}, ${"6".repeat(64)}, now() + interval '30 minutes')
    `

    // solicitação de retirada pelo responsável
    const requested = await sql`
      update public.kid_attendances
      set status = 'checkout_requested', checkout_requested_at = now(), checkout_requested_by = ${profileId}
      where id = ${attendanceId} and company_id = ${companyId} and status = 'checked_in'
      returning id, status
    `
    assert.equal(requested[0]?.status, "checkout_requested")

    // rotação no portal: revoga a ativa e insere nova
    await sql`update public.kid_pickup_credentials set status = 'revoked', revoked_at = now() where attendance_id = ${attendanceId} and status = 'active'`
    await sql`
      insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, guardian_id, token_hash, pin_hash, pin_expires_at, rotation_count)
      values (${companyId}, ${attendanceId}, ${kidId}, ${guardianLinkId}, ${"7".repeat(64)}, ${"8".repeat(64)}, now() + interval '30 minutes', 1)
    `
    const activeCredentials = await sql`
      select count(*)::int as count, min(guardian_id::text) as guardian_id from public.kid_pickup_credentials
      where attendance_id = ${attendanceId} and status = 'active'
    `
    assert.equal(activeCredentials[0].count, 1)
    assert.equal(activeCredentials[0].guardian_id, guardianLinkId, "credencial fica vinculada ao responsável autorizado")

    // --- 5) portões do cadastro de visitante: módulo ativo + formulário habilitado
    await sql`
      insert into public.company_modules (company_id, module_id, enabled)
      values (${companyId}, 'kids', true)
      on conflict (company_id, module_id) do update set enabled = true
    `
    enabledModule = true
    const viewCheck = await sql`
      select module_id from public.company_enabled_modules
      where company_id = ${companyId} and module_id = 'kids'
    `
    assert.equal(viewCheck.length, 1, "view reflete ativação manual do módulo")

    // consentimento com origem portal é aceito pelo constraint
    await sql`
      insert into public.kid_consents (company_id, kid_id, consent_type, version, status, source)
      values (${companyId}, ${kidId}, 'data_processing', '1.0', 'granted', 'portal')
    `
    const consentCheck = await sql`
      select source from public.kid_consents where kid_id = ${kidId} and consent_type = 'data_processing' and status = 'granted'
    `
    assert.equal(consentCheck[0].source, "portal")
  } finally {
    if (enabledModule && companyId) {
      await sql`delete from public.company_modules where company_id = ${companyId} and module_id = 'kids'`
    }
    if (sessionId) {
      await sql`delete from public.kid_pickup_credentials where attendance_id in (select id from public.kid_attendances where session_id = ${sessionId})`
      await sql`delete from public.kid_attendances where session_id = ${sessionId}`
      await sql`delete from public.kid_sessions where id = ${sessionId}`
    }
    if (kidId) {
      await sql`delete from public.kid_consents where kid_id = ${kidId}`
      await sql`delete from public.kid_guardians where kid_id = ${kidId}`
      await sql`delete from public.kid_profiles where id = ${kidId}`
    }
    if (profileId) await sql`delete from public.profiles where id = ${profileId}`
    if (guardianPersonId) await sql`delete from public.people where id = ${guardianPersonId}`
    if (childPersonId) await sql`delete from public.people where id = ${childPersonId}`
    await sql.end()
  }
})

test("kids hardening: IDOR, vínculo de retirada, reautenticação e cron compartilhado", () => {
  const portalActions = readFileSync("src/lib/kids/portal-actions.ts", "utf8")
  const actions = readFileSync("src/lib/kids/actions.ts", "utf8")
  const worker = readFileSync("src/app/api/internal/integrations/dispatch/route.ts", "utf8")
  const migration = readFileSync("supabase/migrations/20260718110000_kids_pickup_guardian_binding.sql", "utf8")

  assert.match(portalActions, /update public\.kid_attendances attendance[\s\S]*exists \([\s\S]*guardian\.profile_id = \$\{user\.id\}[\s\S]*guardian\.can_checkout = true/)
  assert.match(actions, /requireRecentAuthentication\(\)/)
  assert.match(actions, /guardian_authorized/)
  assert.match(actions, /guardian_id, token_hash, pin_hash/)
  assert.match(worker, /processKidDeliveryOutbox/)
  assert.match(worker, /reconcileKidWhatsApp/)
  assert.match(migration, /add column if not exists guardian_id uuid/)
})
