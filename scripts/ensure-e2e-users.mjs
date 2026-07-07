import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"

const root = process.cwd()
const accountDocPath = process.env.E2E_ACCOUNTS_DOC ?? path.join(root, "docs", "testing", "e2e-accounts.local.md")
const envPath = path.join(root, ".env.local")

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

  return {
    baseUrl,
    supabaseProjectRef,
    supabaseUrl,
    companyLegacyId: process.env.E2E_COMPANY_LEGACY_ID ?? "c1",
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
        companyLegacyId: process.env.E2E_COMPANY_LEGACY_ID ?? "c1",
      },
      member: {
        email: process.env.E2E_MEMBER_EMAIL ?? "e2e.membro@altar-church.test",
        password,
        role: "reader",
        name: "Membro E2E",
        companyLegacyId: process.env.E2E_COMPANY_LEGACY_ID ?? "c1",
      },
    },
  }
}

function readAccountDocument() {
  if (!existsSync(accountDocPath)) return buildDefaultAccountDocument()

  const content = readFileSync(accountDocPath, "utf8")
  const match = content.match(/```json\s*([\s\S]*?)```/)
  if (!match) throw new Error(`Bloco JSON nao encontrado em ${accountDocPath}`)
  return JSON.parse(match[1])
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

async function main() {
  const env = { ...process.env, ...readKeyValueFile(envPath) }
  Object.assign(process.env, env)
  const doc = readAccountDocument()
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
      select id
      from public.companies
      where legacy_id = ${doc.companyLegacyId}
      limit 1
    `
    if (!company?.id) throw new Error(`Empresa ${doc.companyLegacyId} nao encontrada`)

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

    const accountEntries = Object.entries(doc.accounts)
    for (const [key, account] of accountEntries) {
      const authUserId = supabase
        ? await ensureAuthUser(supabase, account)
        : await ensureAuthUserDirect(sql, account)
      const companyId = account.companyLegacyId ? company.id : null

      await sql`
        insert into public.profiles (auth_user_id, company_id, name, email, role, active)
        values (${authUserId}, ${companyId}, ${account.name}, ${account.email}, ${account.role}, true)
        on conflict (email) do update
        set auth_user_id = excluded.auth_user_id,
            company_id = excluded.company_id,
            name = excluded.name,
            role = excluded.role,
            active = true,
            updated_at = now()
      `

      console.log(`ok ${key}: ${account.email}`)
    }
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
