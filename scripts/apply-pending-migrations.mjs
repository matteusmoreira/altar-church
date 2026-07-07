import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"

const migrationsDir = path.join(process.cwd(), "supabase", "migrations")
const connectionString =
  process.env.POSTGRES_URL ??
  (process.env.SUPABASE_DB_PASSWORD && process.env.SUPABASE_PROJECT_REF
    ? `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.${process.env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`
    : null)

if (!connectionString) {
  throw new Error("POSTGRES_URL ou SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF obrigatorios")
}

const sql = postgres(connectionString, { max: 1 })

try {
  const repoMigrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.replace(/\.sql$/, ""))
    .sort()

  const migrationStamp = (version) => version.slice(0, 14)

  const appliedRows = await sql.unsafe(
    "select version from supabase_migrations.schema_migrations order by version",
  )
  const applied = new Set(appliedRows.map((row) => migrationStamp(String(row.version))))
  const pending = repoMigrations.filter((version) => !applied.has(migrationStamp(version)))

  console.log(`migrations no repo: ${repoMigrations.length}`)
  console.log(`migrations aplicadas: ${applied.size}`)
  console.log(`migrations pendentes: ${pending.length}`)

  if (pending.length === 0) {
    console.log("nenhuma migration pendente")
    process.exit(0)
  }

  for (const version of pending) {
    const filePath = path.join(migrationsDir, `${version}.sql`)
    const contents = fs.readFileSync(filePath, "utf8")
    console.log(`aplicando ${version}...`)

    await sql.unsafe(contents)
    const stamp = migrationStamp(version)
    const name = version.slice(15) || version
    await sql.unsafe(
      "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2) on conflict (version) do nothing",
      [stamp, name],
    )
    console.log(`ok ${version}`)
  }
} finally {
  await sql.end()
}