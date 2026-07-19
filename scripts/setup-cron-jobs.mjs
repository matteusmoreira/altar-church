/**
 * Fix + recria cron jobs para integration e volunteer workers.
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

const connectionString = process.env.POSTGRES_URL
if (!connectionString) { console.error("POSTGRES_URL obrigatório"); process.exit(1) }

const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const integrationWorkerSecret = process.env.INTEGRATION_WORKER_SECRET || ""
const volunteerWorkerSecret = process.env.VOLUNTEER_WORKER_SECRET || ""

const sql = postgres(connectionString, { max: 1, ssl: "require", prepare: false, connect_timeout: 30 })

try {
  console.log("=== Setup Cron Jobs ===\n")

  // 1. Listar jobs existentes
  const existingJobs = await sql`select jobid, jobname, schedule, active from cron.job`
  console.log("Jobs existentes:")
  for (const j of existingJobs) {
    console.log(`  [${j.jobid}] ${j.jobname} — ${j.schedule} (active: ${j.active})`)
  }

  // 2. Remover jobs antigos (usando jobname, não jobid)
  for (const jobname of [
    "integration-delivery-dispatch-every-2-minutes",
    "volunteer-delivery-worker-every-5-minutes",
    "volunteer-delivery-worker-every-minute",
  ]) {
    const found = existingJobs.filter(j => j.jobname === jobname)
    if (found.length > 0) {
      try {
        await sql.unsafe(`select cron.unschedule('${jobname}')`)
        console.log(`\n✅ Removido job: ${jobname}`)
      } catch (e) {
        console.warn(`⚠️  Falha ao remover ${jobname}: ${e.message}`)
        // Tentar cleanup direto
        try {
          await sql`delete from cron.job where jobname = ${jobname}`
          console.log(`  Cleanup direto: OK`)
        } catch { /* ignore */ }
      }
    }
  }

  // 3. Configurar Vault secrets
  console.log("\n--- Vault Secrets ---")

  async function upsertVaultSecret(name, value) {
    const existing = await sql`select id from vault.secrets where name = ${name} limit 1`.catch(() => [])
    if (existing?.[0]?.id) {
      try {
        await sql`select vault.update_secret(${existing[0].id}::uuid, ${value})`
        console.log(`  vault updated: ${name}`)
        return
      } catch {
        try {
          await sql`select vault.update_secret(${existing[0].id}::uuid, ${value}, ${name})`
          console.log(`  vault updated: ${name}`)
          return
        } catch {
          // fallthrough to create
        }
      }
    }
    await sql`select vault.create_secret(${value}, ${name}, ${"Altar Church cron"})`
    console.log(`  vault created: ${name}`)
  }

  const integrationUrl = `https://${projectRef}.supabase.co/functions/v1/integration-delivery-worker`
  const volunteerUrl = `https://${projectRef}.supabase.co/functions/v1/volunteer-delivery-worker`

  await upsertVaultSecret("integration_dispatch_url", integrationUrl)
  await upsertVaultSecret("integration_worker_secret", integrationWorkerSecret)
  await upsertVaultSecret("supabase_service_role_key", serviceRole)
  await upsertVaultSecret("volunteer_worker_url", volunteerUrl)
  await upsertVaultSecret("volunteer_worker_secret", volunteerWorkerSecret)

  // 4. Criar cron Integration (cada 2 minutos)
  console.log("\n--- Criando cron: integration (*/2 * * * *) ---")
  await sql.unsafe(`
    select cron.schedule(
      'integration-delivery-dispatch-every-2-minutes',
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
  `)
  console.log("✅ Integration cron criado")

  // 5. Criar cron Volunteer (a cada minuto)
  console.log("\n--- Criando cron: volunteer (* * * * *) ---")
  await sql.unsafe(`
    select cron.schedule(
      'volunteer-delivery-worker-every-minute',
      '* * * * *',
      $cmd$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'volunteer_worker_url'),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_service_role_key'),
            'x-volunteer-worker-secret',
            (select decrypted_secret from vault.decrypted_secrets where name = 'volunteer_worker_secret')
          ),
          body := '{}'::jsonb
        );
      $cmd$
    );
  `)
  console.log("✅ Volunteer cron criado")

  // 6. Verificar
  const finalJobs = await sql`select jobid, jobname, schedule, active from cron.job`
  console.log("\n--- Jobs finais ---")
  for (const j of finalJobs) {
    console.log(`  [${j.jobid}] ${j.jobname} — ${j.schedule} (active: ${j.active})`)
  }

  // 7. Verificar Vault
  const vaultCheck = await sql`
    select name, (decrypted_secret is not null and length(decrypted_secret) > 0) as has_value
    from vault.decrypted_secrets
    where name in (
      'integration_dispatch_url', 'integration_worker_secret',
      'supabase_service_role_key',
      'volunteer_worker_url', 'volunteer_worker_secret'
    )
  `
  console.log("\n--- Vault check ---")
  for (const r of vaultCheck) {
    console.log(`  ${r.name}: ${r.has_value ? "✅" : "❌ EMPTY"}`)
  }

  console.log("\n=== Setup Cron Jobs CONCLUÍDO ===")
} catch (error) {
  console.error("ERRO:", error.message || error)
  process.exit(1)
} finally {
  await sql.end({ timeout: 5 })
}
