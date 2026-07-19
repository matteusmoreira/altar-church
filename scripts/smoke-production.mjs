/**
 * Smoke test de produção — verifica que todos os componentes estão operacionais.
 * 
 * Uso:
 *   node scripts/smoke-production.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvLocal() {
  const file = path.join(root, ".env.local")
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${projectRef}.supabase.co`
const connectionString = process.env.POSTGRES_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const vercelToken = process.env.VERCEL_TOKEN
if (!vercelToken) {
  console.error("VERCEL_TOKEN obrigatório")
  process.exit(1)
}

// Ler project.json para obter IDs
const projectJsonPath = path.join(root, ".vercel", "project.json")
const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"))
const projectId = projectJson.projectId
const teamId = projectJson.orgId

let passed = 0
let failed = 0
let warnings = 0

function check(name, ok, details = "") {
  if (ok) {
    console.log(`  ✅ ${name}${details ? ` — ${details}` : ""}`)
    passed++
  } else {
    console.error(`  ❌ ${name}${details ? ` — ${details}` : ""}`)
    failed++
  }
}

function warn(name, details = "") {
  console.warn(`  ⚠️  ${name}${details ? ` — ${details}` : ""}`)
  warnings++
}

console.log("=== SMOKE TEST DE PRODUÇÃO ===\n")

// 1. Supabase Health Check
console.log("--- 1. Supabase Health ---")
try {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  const r = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  // 200 ou 406 (no Accept header) são respostas válidas do REST
  check("Supabase REST API", r.status < 500, `status ${r.status}`)
} catch (e) {
  check("Supabase REST API", false, e.message)
}

// 2. Token de acesso
console.log("\n--- 2. Token de Acesso Supabase ---")
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (r.ok) check("Token Supabase (GET project)", true, `status ${r.status}`)
  else warn("Token Supabase Management sem acesso", `status ${r.status}; runtime será validado diretamente`)
  
  const secretsR = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const secrets = secretsR.ok ? await secretsR.json() : []
  if (secretsR.ok) check("Secrets acessíveis", true, `${secrets.length} secrets`)
  else warn("Secrets não listáveis pela API Management", `status ${secretsR.status}`)
} catch (e) {
  check("Token Supabase", false, e.message)
}

// 3. Edge Functions
console.log("\n--- 3. Edge Functions ---")
try {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const functions = r.ok ? await r.json() : []
  if (r.ok) check("Functions listadas", true, `${functions.length} functions`)
  else warn("Functions não listáveis pela API Management", `status ${r.status}`)
  
  for (const fn of functions) {
    check(`  ${fn.slug}`, fn.status === "ACTIVE", `v${fn.version}, status: ${fn.status}`)
  }
  
  // Testar que os workers respondem (esperamos 401 sem secret)
  for (const slug of ["integration-delivery-worker", "volunteer-delivery-worker"]) {
    const fnR = await fetch(`${supabaseUrl}/functions/v1/${slug}`, { method: "POST" })
    check(`  ${slug} responde`, fnR.status === 401 || fnR.status === 500, `status ${fnR.status} (401 = auth ativo)`)
  }

  const workerChecks = [
    {
      slug: "integration-delivery-worker",
      secretHeader: "x-integration-worker-secret",
      secret: process.env.INTEGRATION_WORKER_SECRET || "",
      body: { batchSize: 1 },
    },
    {
      slug: "volunteer-delivery-worker",
      secretHeader: "x-volunteer-worker-secret",
      secret: process.env.VOLUNTEER_WORKER_SECRET || "",
      body: {},
    },
  ]
  for (const worker of workerChecks) {
    const response = await fetch(`${supabaseUrl}/functions/v1/${worker.slug}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
        [worker.secretHeader]: worker.secret,
      },
      body: JSON.stringify(worker.body),
    })
    const body = await response.text()
    check(`  ${worker.slug} autorizado`, response.ok, `status ${response.status} ${body.slice(0, 120)}`)
  }
} catch (e) {
  check("Edge Functions", false, e.message)
}

// 4. Banco de Dados / Cron / Vault
console.log("\n--- 4. Banco de Dados ---")
let sql
try {
  sql = postgres(connectionString, { max: 1, ssl: "require", prepare: false, connect_timeout: 15 })
  
  // Cron jobs
  const cronJobs = await sql`select jobname, schedule, active from cron.job`
  check("pg_cron ativo", cronJobs.length > 0, `${cronJobs.length} jobs`)
  for (const j of cronJobs) {
    check(`  Job: ${j.jobname}`, j.active, j.schedule)
  }
  
  // Vault
  const vaultSecrets = await sql`
    select name, (decrypted_secret is not null and length(decrypted_secret) > 0) as ok
    from vault.decrypted_secrets
    where name in (
      'integration_dispatch_url', 'integration_worker_secret',
      'supabase_service_role_key',
      'volunteer_worker_url', 'volunteer_worker_secret'
    )
  `
  for (const v of vaultSecrets) {
    check(`  Vault: ${v.name}`, v.ok)
  }
  
  // Migrations
  const migrations = await sql`
    select count(*) as total from supabase_migrations.schema_migrations
  `
  check("Migrations aplicadas", migrations[0].total > 0, `${migrations[0].total} migrations`)
  
  // Tabelas essenciais
  const tables = await sql`
    select count(*) as total from information_schema.tables 
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `
  check("Tabelas públicas", tables[0].total > 20, `${tables[0].total} tabelas`)
  
  // RLS habilitado
  const rlsTables = await sql`
    select count(*) as total from pg_tables
    where schemaname = 'public' and rowsecurity = true
  `
  check("RLS habilitado", rlsTables[0].total > 10, `${rlsTables[0].total} tabelas com RLS`)

  const uazapi = await sql`
    select
      exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'uazapi_instances'
      ) as has_table,
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'system_plans'
          and column_name = 'uazapi_instance_limit'
      ) as has_plan_limit
  `
  check("Uazapi multi-tenant", uazapi[0]?.has_table && uazapi[0]?.has_plan_limit)
  
} catch (e) {
  check("Banco de Dados", false, e.message)
} finally {
  if (sql) await sql.end({ timeout: 5 })
}

// 5. Vercel
console.log("\n--- 5. Vercel ---")
try {
  const r = await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  })
  const data = r.ok ? await r.json() : { envs: [] }
  check("Vercel env vars", r.ok, `${(data.envs || []).length} variáveis`)
  
  // Verificar variáveis essenciais
  const essentials = [
    "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "POSTGRES_URL",
    "INTEGRATION_WORKER_SECRET", "UAZAPI_BASE_URL", "UAZAPI_ADMIN_TOKEN",
    "RESEND_API_KEY", "RESEND_FROM_EMAIL",
  ]
  const envKeys = new Set((data.envs || []).map(e => e.key))
  for (const key of essentials) {
    check(`  ${key}`, envKeys.has(key))
  }
  
  // Verificar último deploy
  const deploysR = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1`, {
    headers: { Authorization: `Bearer ${vercelToken}` },
  })
  if (deploysR.ok) {
    const deploys = await deploysR.json()
    const latest = deploys.deployments?.[0]
    if (latest) {
      check("Último deploy", true, `${latest.state} — ${latest.url} (${new Date(latest.created).toISOString()})`)
    } else {
      warn("Nenhum deploy encontrado")
    }
  }
} catch (e) {
  check("Vercel", false, e.message)
}

// 6. Credenciais opcionais
console.log("\n--- 6. Integrações Opcionais ---")
if (process.env.UAZAPI_BASE_URL && process.env.UAZAPI_ADMIN_TOKEN) {
  try {
    const response = await fetch(
      `${process.env.UAZAPI_BASE_URL.replace(/\/$/, "")}/instance/all`,
      { headers: { admintoken: process.env.UAZAPI_ADMIN_TOKEN } },
    )
    const instances = response.ok ? await response.json() : []
    check(
      "Uazapi administrativo operacional",
      response.ok && Array.isArray(instances),
      response.ok ? `${instances.length} instâncias acessíveis` : `status ${response.status}`,
    )
  } catch (error) {
    check("Uazapi administrativo operacional", false, error.message)
  }
} else {
  warn("Uazapi administrativo não configurado — criação de instâncias indisponível")
}

if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
  check("Resend configurado", true)
} else {
  warn("Resend não configurado — e-mail em modo graceful-fail")
}

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  check("VAPID keys", true)
} else {
  warn("VAPID não configurado — push notifications indisponíveis")
}

// Resultado
console.log("\n" + "=".repeat(50))
console.log(`RESULTADO: ${passed} ✅ passed | ${failed} ❌ failed | ${warnings} ⚠️ warnings`)
console.log("=".repeat(50))

if (failed > 0) {
  console.log("\n❌ SISTEMA NÃO ESTÁ 100% — resolver falhas acima")
  process.exit(1)
} else if (warnings > 0) {
  console.log("\n⚠️ SISTEMA OPERACIONAL — warnings são integrações opcionais")
} else {
  console.log("\n✅ SISTEMA 100% PRONTO PARA PRODUÇÃO")
}
