import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) {
  throw new Error("POSTGRES_URL obrigatorio")
}

const sql = postgres(connectionString, { max: 1 })

try {
  const [migrations, routes, bucket, companies, modules, people] = await Promise.all([
    sql`select count(*)::int as c from supabase_migrations.schema_migrations`,
    sql`select id, route from public.system_modules order by id`,
    sql`select id, public from storage.buckets where id = 'church-assets'`,
    sql`select slug, name, active from public.companies order by created_at`,
    sql`select count(*)::int as c from public.company_modules`,
    sql`select count(*)::int as c from public.people`,
  ])

  console.log(
    JSON.stringify(
      {
        migrations: migrations[0].c,
        storageBucket: bucket[0] ?? null,
        companies,
        companyModules: modules[0].c,
        people: people[0].c,
        sampleRoutes: routes.slice(0, 5),
      },
      null,
      2,
    ),
  )
} finally {
  await sql.end()
}