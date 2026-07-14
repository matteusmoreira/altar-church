/**
 * 1) Configura Vault secrets apontando para a Edge Function de dispatch
 * 2) Agenda pg_cron a cada 2 minutos
 *
 * Uso (em altarchurch/):
 *   set SUPABASE_DB_PASSWORD=...
 *   set SUPABASE_ACCESS_TOKEN=...
 *   node scripts/apply-integration-cron.mjs
 *
 * Opcional: --url=https://app.../api/internal/integrations/dispatch
 * (se omitido, usa a Edge Function integration-delivery-worker)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"
const jobName = "integration-delivery-dispatch-every-2-minutes"

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const dbPassword =
  process.env.SUPABASE_DB_PASSWORD ||
  process.env.DB_PASSWORD ||
  // parse from POSTGRES_URL if present
  (() => {
    const u = process.env.POSTGRES_URL
    if (!u) return null
    try {
      return decodeURIComponent(new URL(u).password)
    } catch {
      return null
    }
  })()

const connectionString =
  process.env.POSTGRES_URL ||
  (dbPassword
    ? `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`
    : null)

if (!connectionString) {
  console.error("POSTGRES_URL ou SUPABASE_DB_PASSWORD obrigatório")
  process.exit(1)
}

const workerSecret = process.env.INTEGRATION_WORKER_SECRET
if (!workerSecret) {
  console.error("INTEGRATION_WORKER_SECRET obrigatório no .env.local")
  process.exit(1)
}

const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const urlArg = process.argv.find((a) => a.startsWith("--url="))
const edgeFunctionUrl = `https://${projectRef}.supabase.co/functions/v1/integration-delivery-worker`

let dispatchUrl = urlArg
  ? urlArg.slice("--url=".length).replace(/\/$/, "")
  : process.env.INTEGRATIONS_DISPATCH_URL ||
    (process.env.INTEGRATIONS_BASE_URL
      ? `${process.env.INTEGRATIONS_BASE_URL.replace(/\/$/, "")}/api/internal/integrations/dispatch`
      : edgeFunctionUrl)

const sql = postgres(connectionString, {
  max: 1,
  ssl: "require",
  prepare: false,
  connect_timeout: 30,
})

async function ensureExtension(name) {
  try {
    await sql.unsafe(`create extension if not exists ${name} with schema extensions`)
    console.log(`extension ${name}: ok`)
    return
  } catch {
    // continue
  }
  try {
    await sql.unsafe(`create extension if not exists ${name}`)
    console.log(`extension ${name}: ok`)
  } catch (e) {
    console.warn(`extension ${name}: ${e.message || e}`)
  }
}

async function upsertVaultSecret(name, value) {
  const existing = await sql`
    select id from vault.secrets where name = ${name} limit 1
  `.catch(async () => {
    // older layout
    return sql`select id from vault.secrets where name = ${name} limit 1`.catch(() => [])
  })

  if (existing?.[0]?.id) {
    try {
      await sql`select vault.update_secret(${existing[0].id}::uuid, ${value})`
      console.log(`vault updated: ${name}`)
      return
    } catch {
      try {
        await sql`select vault.update_secret(${existing[0].id}::uuid, ${value}, ${name})`
        console.log(`vault updated: ${name}`)
        return
      } catch (e) {
        console.warn(`vault update failed for ${name}, recreating…`, e.message)
      }
    }
  }

  await sql`select vault.create_secret(${value}, ${name}, ${"Altar Church integrations"})`
  console.log(`vault created: ${name}`)
}

try {
  console.log("=== apply-integration-cron ===")
  console.log("dispatch:", dispatchUrl.replace(/\/\/.*@/, "//***@"))

  await ensureExtension("pg_cron")
  await ensureExtension("pg_net")
  try {
    await ensureExtension("supabase_vault")
  } catch {
    /* vault may already exist */
  }

  const vaultOk = await sql`
    select 1 as ok from information_schema.schemata where schema_name = 'vault' limit 1
  `
  if (!vaultOk[0]) throw new Error("schema vault indisponível")

  await upsertVaultSecret("integration_dispatch_url", dispatchUrl)
  await upsertVaultSecret("integration_worker_secret", workerSecret)
  if (serviceRole) {
    await upsertVaultSecret("supabase_service_role_key", serviceRole)
  } else {
    console.warn("SUPABASE_SERVICE_ROLE_KEY ausente — cron usará só x-integration-worker-secret")
  }

  const check = await sql`
    select name,
      (decrypted_secret is not null and length(decrypted_secret) > 0) as has_value
    from vault.decrypted_secrets
    where name in (
      'integration_dispatch_url',
      'integration_worker_secret',
      'supabase_service_role_key'
    )
  `
  console.log(
    "vault:",
    check.map((r) => `${r.name}=${r.has_value ? "ok" : "empty"}`).join(", "),
  )

  const oldJobs = await sql`
    select jobid from cron.job where jobname = ${jobName}
  `
  for (const job of oldJobs) {
    await sql`select cron.unschedule(${job.jobid})`
    console.log("unscheduled", job.jobid)
  }

  // Headers: function needs Authorization (service role or anon) + worker secret
  const scheduleSql = serviceRole
    ? `
    select cron.schedule(
      '${jobName}',
      '*/2 * * * *',
      $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'integration_dispatch_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
            'x-integration-worker-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'integration_worker_secret')
          ),
          body := '{"batchSize":25}'::jsonb
        );
      $cmd$
    );
  `
    : `
    select cron.schedule(
      '${jobName}',
      '*/2 * * * *',
      $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'integration_dispatch_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-integration-worker-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'integration_worker_secret')
          ),
          body := '{"batchSize":25}'::jsonb
        );
      $cmd$
    );
  `

  await sql.unsafe(scheduleSql)

  const jobs = await sql`
    select jobid, jobname, schedule, active
    from cron.job
    where jobname = ${jobName}
  `
  console.log("cron:", jobs[0] || "MISSING")
  if (!jobs[0]) process.exit(1)
  console.log("OK — job a cada 2 minutos")
} catch (error) {
  console.error("ERRO:", error.message || error)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
