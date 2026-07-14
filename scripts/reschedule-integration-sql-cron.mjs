import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const envPath = path.join(root, ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"
const dbPassword = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD
const connectionString =
  process.env.POSTGRES_URL ||
  (dbPassword
    ? `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`
    : null)

if (!connectionString) {
  console.error("POSTGRES_URL ou SUPABASE_DB_PASSWORD obrigatório")
  process.exit(1)
}

const jobName = "integration-delivery-dispatch-every-2-minutes"
const sql = postgres(connectionString, { max: 1, ssl: "require", prepare: false })

try {
  const jobsBefore = await sql`
    select jobid, jobname, schedule, active from cron.job order by jobid
  `
  console.log("jobs before:", jobsBefore)

  // unschedule by job name (text overload)
  try {
    await sql.unsafe(`select cron.unschedule('${jobName}')`)
    console.log("unscheduled by name")
  } catch (e) {
    console.log("unschedule by name:", e.message)
  }

  // also try by remaining ids
  const remaining = await sql`
    select jobid from cron.job where jobname = ${jobName}
  `
  for (const row of remaining) {
    try {
      await sql`select cron.unschedule(${Number(row.jobid)})`
      console.log("unscheduled id", row.jobid)
    } catch (e) {
      console.log("unschedule id fail", row.jobid, e.message)
    }
  }

  await sql.unsafe(`
    select cron.schedule(
      '${jobName}',
      '*/2 * * * *',
      $cmd$select public.process_integration_deliveries(25);$cmd$
    );
  `)

  const jobsAfter = await sql`
    select jobid, jobname, schedule, active, command
    from cron.job
    where jobname = ${jobName}
  `
  console.log("jobs after:", jobsAfter)

  const fn = await sql`
    select proname from pg_proc where proname = 'process_integration_deliveries'
  `
  console.log("function:", fn[0]?.proname || "MISSING")

  const smoke = await sql`select public.process_integration_deliveries(5) as result`
  console.log("smoke:", smoke[0]?.result)

  if (!jobsAfter[0] || !fn[0]) process.exit(1)
  console.log("OK — cron SQL worker a cada 2 minutos")
} finally {
  await sql.end({ timeout: 5 })
}
