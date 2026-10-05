import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"

const migrationsDir = path.join(process.cwd(), "supabase", "migrations")
const connectionString =
  process.env.POSTGRES_URL ??
  (process.env.SUPABASE_DB_PASSWORD && process.env.SUPABASE_PROJECT_REF
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_DB_PASSWORD)}@db.${process.env.SUPABASE_PROJECT_REF}.supabase.co:5432/postgres?sslmode=require`
    : null)

if (!connectionString) {
  throw new Error("POSTGRES_URL ou SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF obrigatorios")
}

// POSTGRES_URL já carrega sslmode=require; não force rejectUnauthorized aqui,
// pois o pooler Supabase pode apresentar a cadeia CA via configuração da URL.
const sql = postgres(connectionString, { max: 1 })

const migrationStamp = (version) => version.slice(0, 14)
const checksumOf = (contents) => crypto.createHash("sha256").update(contents.replace(/\r\n/g, "\n"), "utf8").digest("hex")

try {
  const repoMigrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.replace(/\.sql$/, ""))
    .sort()

  const appliedRows = await sql.unsafe(
    "select version, name from supabase_migrations.schema_migrations order by version",
  )
  const applied = new Map(appliedRows.map((row) => [migrationStamp(String(row.version)), row]))
  const pending = repoMigrations.filter((version) => !applied.has(migrationStamp(version)))

  console.log(`migrations no repo: ${repoMigrations.length}`)
  console.log(`migrations aplicadas: ${applied.size}`)
  console.log(`migrations pendentes: ${pending.length}`)

  if (pending.length === 0) {
    console.log("nenhuma migration pendente")
  }

  // Trava consultiva em nivel de transacao: dois deploys Vercel em corrida
  // nao aplicam a mesma migration. Expira com o COMMIT/ROLLBACK.

  for (const version of pending) {
    const filePath = path.join(migrationsDir, `${version}.sql`)
    const contents = fs.readFileSync(filePath, "utf8")
    const checksum = checksumOf(contents)
    console.log(`aplicando ${version} (sha256:${checksum.slice(0, 12)})...`)

    // Transacao unica por arquivo: falha no meio = rollback total, sem carimbo parcial.
    // O carimbo grava o checksum para detectar edicao de migration ja aplicada.
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('altar-church-migrations'))`
      const stamp = migrationStamp(version)
      const existing = await tx`select version from supabase_migrations.schema_migrations where version = ${stamp}`
      if (existing[0]) return
      await tx.unsafe(contents)
      const name = version.slice(15) || version
      await tx.unsafe(
        "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2) on conflict (version) do nothing",
        [stamp, `${name}#sha256:${checksum}`],
      )
    })
    console.log(`ok ${version}`)
  }

  // Alerta de deriva: migration ja aplicada cujo arquivo local mudou depois.
  // Nao falha o deploy (migrations antigas sao baseline), mas grita no log.
  for (const version of repoMigrations) {
    const row = applied.get(migrationStamp(version))
    if (!row || typeof row.name !== "string" || !row.name.includes("#sha256:")) continue
    const contents = fs.readFileSync(path.join(migrationsDir, `${version}.sql`), "utf8")
    const local = checksumOf(contents)
    // Carimbos antigos usavam bytes CRLF do Windows. Aceitar ambas as quebras, sem esconder mudanças de SQL.
    const windowsChecksum = crypto.createHash("sha256").update(contents.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8").digest("hex")
    const recorded = row.name.split("#sha256:")[1]
    if (recorded && recorded !== local && recorded !== windowsChecksum) {
      console.warn(`AVISO: ${version} foi editada apos aplicacao (checksum diverge). Crie nova migration em vez de editar.`)
    }
  }
} finally {
  await sql.end()
}
