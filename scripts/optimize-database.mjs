import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatorio")

const sql = postgres(connectionString, { max: 1, idle_timeout: 5 })

try {
  const startedAt = Date.now()
  const tables = await sql`
    select format('%I.%I', schemaname, tablename) as qualified_name
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `

  for (const table of tables) {
    await sql.unsafe(`vacuum (analyze) ${table.qualified_name}`)
  }

  console.log(`VACUUM ANALYZE: ${tables.length} tabelas em ${Date.now() - startedAt} ms`)
} finally {
  await sql.end()
}
