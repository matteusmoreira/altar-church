import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"

const root = process.cwd()
const accountDocPath = process.env.E2E_ACCOUNTS_DOC ?? path.join(root, "docs", "testing", "e2e-accounts.local.md")
const envPath = path.join(root, ".env.local")

function requiredE2ECompanyLegacyId() {
  const companyLegacyId = process.env.E2E_COMPANY_LEGACY_ID?.trim()
  if (!companyLegacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID obrigatório; o setup não escolhe tenant por fallback")
  }
  return companyLegacyId
}

function readKeyValueFile(filePath) {
  if (!existsSync(filePath)) return { ...process.env }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const index = line.indexOf("=")
      if (index > 0) acc[line.slice(0, index).trim()] = line.slice(index + 1).trim()
      return acc
    }, {})
}

function buildPortalAccounts(password, companyLegacyId) {
  return {
    visitor: { email: process.env.E2E_VISITOR_EMAIL ?? "e2e.visitante@altar-church.test", password, role: "member", name: "Visitante E2E", companyLegacyId },
    attendee: { email: process.env.E2E_ATTENDEE_EMAIL ?? "e2e.frequentador@altar-church.test", password, role: "member", name: "Frequentador E2E", companyLegacyId },
    volunteer: { email: process.env.E2E_VOLUNTEER_EMAIL ?? "e2e.voluntario@altar-church.test", password, role: "volunteer", name: "Voluntário E2E", companyLegacyId },
    ministryLeader: { email: process.env.E2E_MINISTRY_LEADER_EMAIL ?? "e2e.lider-ministerio@altar-church.test", password, role: "ministry_leader", name: "Líder Ministério E2E", companyLegacyId },
    ministryLeaderVolunteer: { email: process.env.E2E_MINISTRY_LEADER_VOLUNTEER_EMAIL ?? "e2e.lider-voluntario@altar-church.test", password, role: "ministry_leader", name: "Líder Voluntário E2E", companyLegacyId },
  }
}

function validateE2EAccountDocument(document, configuredCompanyLegacyId) {
  if (!document || typeof document !== "object") throw new Error("Documento E2E inválido")
  const accounts = [
    ...Object.values(document.accounts ?? {}),
    ...Object.values(document.portalAccounts ?? {}),
  ]
  const emails = new Set()
  for (const account of accounts) {
    const email = String(account?.email ?? "").trim().toLowerCase()
    if (!email || emails.has(email)) throw new Error("Documento E2E contém e-mails ausentes ou duplicados")
    emails.add(email)
    if (account.role === "superadmin") {
      if (account.companyLegacyId !== null) throw new Error("Conta superadmin E2E deve ter companyLegacyId nulo")
    } else if (account.companyLegacyId !== configuredCompanyLegacyId) {
      throw new Error(`Conta E2E ${email} aponta para tenant diferente do configurado`)
    }
  }
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!configuredSupabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")
  const expectedUrl = new URL(configuredSupabaseUrl)
  const url = new URL(document.supabaseUrl)
  const expectedProjectRef = process.env.SUPABASE_PROJECT_REF?.trim() ?? expectedUrl.hostname.split(".")[0]
  if (
    url.origin !== expectedUrl.origin ||
    url.hostname !== expectedUrl.hostname ||
    document.supabaseProjectRef !== expectedProjectRef
  ) {
    throw new Error("supabaseUrl/supabaseProjectRef do documento E2E não correspondem ao ambiente configurado")
  }
}

function buildDefaultAccountDocument() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")

  const supabaseProjectRef =
    process.env.SUPABASE_PROJECT_REF ?? new URL(supabaseUrl).hostname.split(".")[0]
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000"
  const password = process.env.E2E_DEFAULT_PASSWORD
  if (!password) {
    throw new Error("E2E_DEFAULT_PASSWORD nao configurado no ambiente")
  }

  const companyLegacyId = requiredE2ECompanyLegacyId()
  return {
    baseUrl,
    supabaseProjectRef,
    supabaseUrl,
    companyLegacyId,
    accounts: {
      superadmin: {
        email: process.env.E2E_SUPERADMIN_EMAIL ?? "e2e.superadmin@altar-church.test",
        password,
        role: "superadmin",
        name: "Superadmin E2E",
        companyLegacyId: null,
      },
      admin: {
        email: process.env.E2E_ADMIN_EMAIL ?? "e2e.admin@altar-church.test",
        password,
        role: "admin",
        name: "Admin E2E",
        companyLegacyId,
      },
      member: {
        email: process.env.E2E_MEMBER_EMAIL ?? "e2e.membro@altar-church.test",
        password,
        role: "member",
        name: "Membro E2E",
        companyLegacyId,
      },
    },
    portalAccounts: buildPortalAccounts(password, companyLegacyId),
  }
}

function readAccountDocument() {
  if (!existsSync(accountDocPath)) return buildDefaultAccountDocument()

  const content = readFileSync(accountDocPath, "utf8")
  const match = content.match(/```json\s*([\s\S]*?)```/)
  if (!match) throw new Error(`Bloco JSON nao encontrado em ${accountDocPath}`)
  const document = JSON.parse(match[1])
  if (document.accounts?.member) document.accounts.member.role = "member"
  document.portalAccounts ??= buildPortalAccounts(document.accounts.member.password, document.companyLegacyId)
  return document
}

function readSupabaseAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  throw new Error("SUPABASE_ACCESS_TOKEN nao configurado no ambiente")
}

function getApiKeys(projectRef, env = process.env) {
  const output = execFileSync("supabase", ["projects", "api-keys", "--project-ref", projectRef, "-o", "json"], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
  const keys = JSON.parse(output)
  const serviceRole = keys.find((key) => key.name === "service_role")
  if (!serviceRole?.api_key) throw new Error("service_role key nao encontrada pela Supabase CLI")
  return serviceRole.api_key
}

function getServiceRoleKey(projectRef) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    return getApiKeys(projectRef)
  } catch (profileError) {
    try {
      return getApiKeys(projectRef, {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: readSupabaseAccessToken(),
      })
    } catch (tokenError) {
      throw new Error(
        `Nao foi possivel obter service_role. Perfil CLI: ${profileError.message}. Token local: ${tokenError.message}`
      )
    }
  }
}

function tryGetServiceRoleKey(projectRef) {
  try {
    return getServiceRoleKey(projectRef)
  } catch (error) {
    console.warn(`service_role indisponivel; usando setup direto no Postgres. ${error.message}`)
    return null
  }
}

async function ensureAuthUser(supabase, account) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error

  const existing = data.users.find((user) => user.email?.toLowerCase() === account.email.toLowerCase())
  if (existing) {
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
      password: account.password,
      email_confirm: true,
      user_metadata: {
        name: account.name,
        role: account.role,
        e2e: true,
      },
    })
    if (updateError) throw updateError
    return updated.user.id
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      name: account.name,
      role: account.role,
      e2e: true,
    },
  })
  if (createError) throw createError
  return created.user.id
}

async function ensureAuthUserDirect(sql, account) {
  const metadata = {
    name: account.name,
    role: account.role,
    e2e: true,
  }
  const [existing] = await sql`
    select id
    from auth.users
    where lower(email) = lower(${account.email})
    limit 1
  `

  let authUserId = existing?.id ?? null

  if (authUserId) {
    await sql`
      update auth.users
      set aud = 'authenticated',
          role = 'authenticated',
          encrypted_password = extensions.crypt(${account.password}, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          confirmation_token = '',
          recovery_token = '',
          email_change_token_new = '',
          email_change = '',
          raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
          raw_user_meta_data = ${sql.json(metadata)},
          updated_at = now(),
          phone_change = '',
          phone_change_token = '',
          email_change_token_current = '',
          email_change_confirm_status = 0,
          reauthentication_token = '',
          deleted_at = null
      where id = ${authUserId}
    `
  } else {
    const [created] = await sql`
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        phone,
        phone_change,
        phone_change_token,
        email_change_token_current,
        email_change_confirm_status,
        reauthentication_token,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        is_sso_user,
        is_anonymous
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        gen_random_uuid(),
        'authenticated',
        'authenticated',
        ${account.email},
        extensions.crypt(${account.password}, extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        ${sql.json(metadata)},
        false,
        now(),
        now(),
        null,
        '',
        '',
        '',
        0,
        '',
        '',
        '',
        '',
        '',
        false,
        false
      )
      returning id
    `
    authUserId = created.id
  }

  await sql`
    insert into auth.identities (
      user_id,
      provider_id,
      provider,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      ${authUserId},
      ${authUserId},
      'email',
      jsonb_build_object(
        'sub', ${authUserId}::text,
        'email', ${account.email}::text,
        'email_verified', false,
        'phone_verified', false
      ),
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = now()
  `

  return authUserId
}

async function ensurePortalIdentity(sql, { key, account, companyId, profileId }) {
  const persona = {
    member: { personType: "member", status: "active", volunteer: false, leader: false },
    visitor: { personType: "visitor", status: "visitor", volunteer: false, leader: false },
    attendee: { personType: "attendee", status: "active", volunteer: false, leader: false },
    volunteer: { personType: "volunteer", status: "active", volunteer: true, leader: false },
    ministryLeader: { personType: "leader", status: "active", volunteer: false, leader: true },
    ministryLeaderVolunteer: { personType: "leader", status: "active", volunteer: true, leader: true },
  }[key]
  if (!persona || !companyId) return

  const [firstName, ...lastParts] = account.name.trim().split(/\s+/)
  const lastName = lastParts.join(" ")
  let [person] = await sql`
    select id
    from public.people
    where company_id = ${companyId}
      and lower(email) = lower(${account.email})
      and deleted_at is null
    order by created_at
    limit 1
  `
  if (person) {
    ;[person] = await sql`
      update public.people
      set first_name = ${firstName},
          last_name = ${lastName},
          full_name = ${account.name},
          profile_id = ${profileId},
          access_profile = ${account.role},
          status = ${persona.status},
          person_type = ${persona.personType},
          is_active = true,
          updated_by = ${profileId},
          updated_at = now()
      where id = ${person.id}
      returning id
    `
  } else {
    ;[person] = await sql`
      insert into public.people (
        company_id, first_name, last_name, full_name, email, profile_id,
        access_profile, status, person_type, is_active, email_validated,
        created_by, updated_by
      )
      values (
        ${companyId}, ${firstName}, ${lastName}, ${account.name}, ${account.email}, ${profileId},
        ${account.role}, ${persona.status}, ${persona.personType}, true, true,
        ${profileId}, ${profileId}
      )
      returning id
    `
  }

  await sql`
    update public.profiles
    set person_id = ${person.id}, updated_at = now()
    where id = ${profileId}
  `

  if (persona.volunteer) {
    await sql`
      insert into public.volunteer_profiles (
        company_id, person_id, registration_status, created_by, updated_by
      )
      values (${companyId}, ${person.id}, 'active', ${profileId}, ${profileId})
      on conflict (person_id) where deleted_at is null do update
      set company_id = excluded.company_id,
          registration_status = 'active',
          deleted_at = null,
          updated_by = excluded.updated_by,
          updated_at = now()
    `
  }

  if (persona.leader) {
    const ministryName = key === "ministryLeaderVolunteer"
      ? "Ministério Líder Voluntário E2E"
      : "Ministério Líder E2E"
    const [ministry] = await sql`
      select id
      from public.ministries
      where company_id = ${companyId}
        and name = ${ministryName}
        and deleted_at is null
      limit 1
    `
    if (ministry) {
      await sql`
        update public.ministries
        set leader_person_id = ${person.id},
            is_active = true,
            updated_by = ${profileId},
            updated_at = now()
        where id = ${ministry.id}
      `
    } else {
      await sql`
        insert into public.ministries (
          company_id, name, description, contact, leader_person_id,
          is_active, created_by, updated_by
        )
        values (
          ${companyId}, ${ministryName}, 'Ministério para matriz E2E',
          ${account.email}, ${person.id}, true, ${profileId}, ${profileId}
        )
      `
    }
  }
}

/**
 * Dados de conteudo consumidos pelas specs autenticadas (DESAFIOS 03/10/2026):
 * pessoas de exemplo para as listas de Pessoas, celulas GCEU, posts publicados
 * para o portal publico, banner de boas-vindas e departamento/role de
 * voluntariado para a API de performance. Tudo idempotente e revivendo linhas
 * soft-deleted do proprio tenant de teste.
 */
async function ensureSeedContentData(sql, { companyId, profileId }) {
  const [churchProfile] = await sql`
    select id
    from public.church_profiles
    where company_id = ${companyId}
    limit 1
  `
  if (churchProfile) {
    await sql`
      update public.church_profiles
      set public_name = 'Igreja E2E Central',
          responsible_name = 'Admin E2E',
          updated_at = now()
      where id = ${churchProfile.id}
    `
  } else {
    await sql`
      insert into public.church_profiles (
        company_id, public_name, responsible_name, email, phone, website,
        address, city, state, country, timezone, history, created_by, updated_by
      )
      values (
        ${companyId}, 'Igreja E2E Central', 'Admin E2E', 'contato@altar-church.test',
        '(11) 90000-0000', 'https://igreja-e2e.test', 'Rua E2E, 100', 'São Paulo', 'SP',
        'Brasil', 'America/Sao_Paulo', 'Igreja ficticia usada pelos testes automatizados.',
        ${profileId}, ${profileId}
      )
    `
  }

  const samplePeople = [
    { firstName: "João", lastName: "Silva", fullName: "João Silva", email: "joao.silva@e2e.altar-church.test" },
    { firstName: "Maria", lastName: "Santos", fullName: "Maria Santos", email: "maria.santos@e2e.altar-church.test" },
    { firstName: "Ana", lastName: "Costa", fullName: "Ana Costa", email: "ana.costa@e2e.altar-church.test" },
  ]
  for (const person of samplePeople) {
    const [existing] = await sql`
      select id, deleted_at
      from public.people
      where company_id = ${companyId}
        and lower(email) = lower(${person.email})
      order by created_at
      limit 1
    `
    if (existing) {
      await sql`
        update public.people
        set first_name = ${person.firstName},
            last_name = ${person.lastName},
            full_name = ${person.fullName},
            deleted_at = null,
            is_active = true,
            status = 'active',
            person_type = 'member',
            updated_by = ${profileId},
            updated_at = now()
        where id = ${existing.id}
      `
    } else {
      await sql`
        insert into public.people (
          company_id, first_name, last_name, full_name, email,
          access_profile, status, person_type, is_active, email_validated,
          created_by, updated_by
        )
        values (
          ${companyId}, ${person.firstName}, ${person.lastName}, ${person.fullName}, ${person.email},
          'member', 'active', 'member', true, true,
          ${profileId}, ${profileId}
        )
      `
    }
  }

  const sampleGroups = [
    { name: "GCEU Família Restaurada", meetingDay: "Quarta" },
    { name: "GCEU Jovens em Ação", meetingDay: "Sexta" },
  ]
  for (const group of sampleGroups) {
    const [existing] = await sql`
      select id
      from public.groups
      where company_id = ${companyId}
        and name = ${group.name}
      order by created_at
      limit 1
    `
    if (existing) {
      await sql`
        update public.groups
        set deleted_at = null,
            is_active = true,
            updated_by = ${profileId},
            updated_at = now()
        where id = ${existing.id}
      `
    } else {
      await sql`
        insert into public.groups (
          company_id, name, description, type, meeting_day, meeting_time,
          meeting_location, neighborhood, city, max_capacity, accepts_requests,
          is_active, postal_code, address_number, address_complement, state,
          is_address_public, is_leader_whatsapp_public, custom_whatsapp_message,
          whatsapp_message, created_by, updated_by
        )
        values (
          ${companyId}, ${group.name}, 'Célula E2E de exemplo', 'cell', ${group.meetingDay}, '20:00',
          'Rua E2E, 100', 'Centro', 'São Paulo', 15, true,
          true, '01001-000', '100', '', 'SP',
          true, false, false, '{}', ${profileId}, ${profileId}
        )
      `
    }
  }

  let [category] = await sql`
    select id
    from public.content_categories
    where company_id = ${companyId}
      and slug = 'noticias-e2e'
    order by created_at
    limit 1
  `
  if (!category) {
    ;[category] = await sql`
      insert into public.content_categories (
        company_id, name, slug, description, content_type, sort_order,
        is_active, created_by, updated_by
      )
      values (
        ${companyId}, 'Notícias E2E', 'noticias-e2e', 'Categoria de exemplo para os testes', 'news', 0,
        true, ${profileId}, ${profileId}
      )
      returning id
    `
  }

  const samplePosts = [
    { title: "Culto de Celebração neste domingo", slug: "culto-de-celebracao-neste-domingo" },
    { title: "Perseverança em tempos difíceis", slug: "perseveranca-em-tempos-dificeis" },
  ]
  for (const post of samplePosts) {
    const [existing] = await sql`
      select id
      from public.content_posts
      where company_id = ${companyId}
        and slug = ${post.slug}
      order by created_at
      limit 1
    `
    if (existing) {
      await sql`
        update public.content_posts
        set title = ${post.title},
            status = 'published',
            published_at = now(),
            deleted_at = null,
            category_id = ${category.id},
            updated_by = ${profileId},
            updated_at = now()
        where id = ${existing.id}
      `
    } else {
      await sql`
        insert into public.content_posts (
          company_id, category_id, type, title, slug, summary, content,
          author_name, status, published_at, created_by, updated_by
        )
        values (
          ${companyId}, ${category.id}, 'news', ${post.title}, ${post.slug},
          'Publicação de exemplo criada pelo seed E2E',
          'Conteúdo fictício usado pelos testes automatizados.',
          'Admin E2E', 'published', now(), ${profileId}, ${profileId}
        )
      `
    }
  }

  const [welcomeBanner] = await sql`
    select id
    from public.banners
    where company_id = ${companyId}
      and title = 'Bem-vindo ao Altar Church'
    order by created_at
    limit 1
  `
  if (welcomeBanner) {
    await sql`
      update public.banners
      set deleted_at = null,
          is_active = true,
          show_in_web = true,
          show_in_apps = true,
          updated_at = now()
      where id = ${welcomeBanner.id}
    `
  } else {
    await sql`
      insert into public.banners (company_id, title, is_active, show_in_web, show_in_apps, created_by, updated_by)
      values (${companyId}, 'Bem-vindo ao Altar Church', true, true, true, ${profileId}, ${profileId})
    `
  }

  let [department] = await sql`
    select id
    from public.volunteer_departments
    where company_id = ${companyId}
      and name = 'Recepção E2E'
    order by created_at
    limit 1
  `
  if (department) {
    await sql`
      update public.volunteer_departments
      set deleted_at = null,
          is_active = true,
          updated_at = now()
      where id = ${department.id}
    `
  } else {
    ;[department] = await sql`
      insert into public.volunteer_departments (
        company_id, name, description, is_active, created_by, updated_by
      )
      values (${companyId}, 'Recepção E2E', 'Departamento de exemplo para os testes', true, ${profileId}, ${profileId})
      returning id
    `
  }

  const [role] = await sql`
    select id
    from public.volunteer_department_roles
    where company_id = ${companyId}
      and department_id = ${department.id}
      and name = 'Recepcionista E2E'
    order by created_at
    limit 1
  `
  if (role) {
    await sql`
      update public.volunteer_department_roles
      set deleted_at = null,
          is_active = true,
          updated_at = now()
      where id = ${role.id}
    `
  } else {
    await sql`
      insert into public.volunteer_department_roles (
        company_id, department_id, name, description, instructions, is_active
      )
      values (${companyId}, ${department.id}, 'Recepcionista E2E', 'Função de exemplo', '', true)
    `
  }
}

async function main() {
  const env = { ...process.env, ...readKeyValueFile(envPath) }
  Object.assign(process.env, env)
  const doc = readAccountDocument()
  const configuredCompanyLegacyId = requiredE2ECompanyLegacyId()
  if (doc.companyLegacyId !== configuredCompanyLegacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID não corresponde ao tenant declarado no documento E2E")
  }
  validateE2EAccountDocument(doc, configuredCompanyLegacyId)
  const runId = process.env.E2E_RUN_ID?.trim() || `${Date.now()}-${randomUUID().slice(0, 8)}`
  const sql = postgres(env.POSTGRES_URL, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false })
  const serviceRoleKey = tryGetServiceRoleKey(doc.supabaseProjectRef)
  const supabase = serviceRoleKey
    ? createClient(doc.supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null

  try {
    const [company] = await sql`
      select id, status
      from public.companies
      where legacy_id = ${configuredCompanyLegacyId}
        and status = 'test'
        and active = true
      limit 1
    `
    if (!company?.id) {
      throw new Error(`Tenant E2E ${configuredCompanyLegacyId} não encontrado com status=test e active=true`)
    }

    await sql`
      insert into public.company_modules (company_id, module_id, enabled)
      select ${company.id}, id, true
      from public.system_modules
      where active = true
      on conflict (company_id, module_id) do update
      set enabled = true,
          updated_at = now()
    `

    await sql`
      update public.banners
      set title = 'Bem-vindo ao Altar Church',
          updated_at = now()
      where company_id = ${company.id}
        and lower(title) = lower('Bem-vindo ao EcclesiaHub')
    `

    const accountEntries = [
      ...Object.entries(doc.accounts),
      ...Object.entries(doc.portalAccounts ?? {}),
    ]
    for (const [key, account] of accountEntries) {
      const expectedCompanyId = account.companyLegacyId === null ? null : company.id
      if (account.role === "superadmin" ? expectedCompanyId !== null : account.companyLegacyId !== configuredCompanyLegacyId) {
        throw new Error(`Conta E2E ${account.email} não pode ser vinculada ao tenant selecionado`)
      }
      const [existingProfile] = await sql`
        select company_id
        from public.profiles
        where lower(email) = lower(${account.email})
        limit 1
      `
      if (existingProfile && existingProfile.company_id !== expectedCompanyId) {
        throw new Error(`E-mail E2E ${account.email} já pertence a outro tenant; setup abortado`)
      }
      const authUserId = supabase
        ? await ensureAuthUser(supabase, account)
        : await ensureAuthUserDirect(sql, account)
      const companyId = expectedCompanyId

      const [profile] = await sql`
        insert into public.profiles (auth_user_id, company_id, name, email, role, active)
        values (${authUserId}, ${companyId}, ${account.name}, ${account.email}, ${account.role}, true)
        on conflict (email) do update
        set auth_user_id = excluded.auth_user_id,
            company_id = excluded.company_id,
            name = excluded.name,
            role = excluded.role,
            active = true,
            updated_at = now()
        returning id
      `

      await ensurePortalIdentity(sql, { key, account, companyId, profileId: profile.id })
      if (key === "admin") {
        await ensureSeedContentData(sql, { companyId, profileId: profile.id })
      }
      console.log(`ok ${key}: ${account.email} (${runId})`)
    }
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
