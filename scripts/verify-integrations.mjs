/**
 * Verifica schema da plataforma de integrações no Postgres.
 * Uso: POSTGRES_URL=... node scripts/verify-integrations.mjs
 * Ou carrega .env.local se existir.
 */
import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local")
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

const connectionString =
  process.env.POSTGRES_URL ??
  (process.env.SUPABASE_DB_PASSWORD && process.env.SUPABASE_PROJECT_REF
    ? `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.${process.env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`
    : null)

if (!connectionString) {
  console.error("POSTGRES_URL (ou SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF) obrigatório")
  process.exit(1)
}

const sql = postgres(connectionString, { max: 1, ssl: "require" })

const expectedTables = [
  "integration_webhook_endpoints",
  "integration_delivery_outbox",
  "api_keys",
]

try {
  const tables = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${expectedTables})
    order by 1
  `
  const found = new Set(tables.map((r) => r.table_name))
  const missing = expectedTables.filter((t) => !found.has(t))

  const fn = await sql`
    select proname
    from pg_proc
    where proname = 'claim_integration_delivery_batch'
  `

  const mig = await sql`
    select version, name
    from supabase_migrations.schema_migrations
    where version like '20260715%'
    order by version
  `

  const counts = await sql`
    select
      (select count(*)::int from public.integration_webhook_endpoints where deleted_at is null) as endpoints,
      (select count(*)::int from public.integration_delivery_outbox) as deliveries,
      (select count(*)::int from public.api_keys where revoked_at is null) as api_keys_active
  `

  console.log("=== integrations:verify ===")
  console.log("tables:", [...found].join(", ") || "(none)")
  if (missing.length) {
    console.error("MISSING tables:", missing.join(", "))
  }
  console.log(
    "claim function:",
    fn.length ? "ok" : "MISSING",
  )
  console.log(
    "migration:",
    mig.map((m) => `${m.version}${m.name ? ` (${m.name})` : ""}`).join(", ") || "(not recorded)",
  )
  console.log("counts:", counts[0])

  const workerSet = Boolean(process.env.INTEGRATION_WORKER_SECRET)
  console.log("INTEGRATION_WORKER_SECRET:", workerSet ? "set" : "MISSING in env")

  if (missing.length || !fn.length) {
    process.exit(1)
  }
  console.log("OK — schema de integrações pronto")
} finally {
  await sql.end({ timeout: 5 })
}
