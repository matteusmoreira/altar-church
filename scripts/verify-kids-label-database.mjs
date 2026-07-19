import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatorio")

const sql = postgres(connectionString, { max: 1, idle_timeout: 5 })

try {
  const [migration, tables, indexes, seeds, revisions, attendanceColumns] = await Promise.all([
    sql`select version, name from supabase_migrations.schema_migrations where version = '20260718170000'`,
    sql`
      select c.relname, c.relrowsecurity,
        (select count(*)::int from pg_policy policy where policy.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace namespace on namespace.oid = c.relnamespace
      where namespace.nspname = 'public'
        and c.relname in ('kid_label_templates', 'kid_label_template_revisions')
      order by c.relname
    `,
    sql`
      select tablename, indexname, indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename in ('kid_label_templates', 'kid_label_template_revisions', 'kid_attendances')
        and (indexname like 'kid_label%' or indexname like 'kid_attendances_%label%')
      order by tablename, indexname
    `,
    sql`
      select kind, count(*)::int as templates, count(published_revision_id)::int as published
      from public.kid_label_templates
      where deleted_at is null
      group by kind
      order by kind
    `,
    sql`select status, count(*)::int from public.kid_label_template_revisions group by status order by status`,
    sql`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'kid_attendances'
        and column_name in ('child_label_revision_id', 'guardian_label_revision_id')
      order by column_name
    `,
  ])

  console.log(JSON.stringify({ migration, tables, indexes, seeds, revisions, attendanceColumns }, null, 2))
} finally {
  await sql.end()
}
