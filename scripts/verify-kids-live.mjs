import postgres from "postgres"

if (!process.env.POSTGRES_URL) {
  throw new Error("POSTGRES_URL obrigatória")
}

const sql = postgres(process.env.POSTGRES_URL, { max: 1 })

try {
  const [tables] = await sql`
    select
      count(*)::integer as total,
      count(*) filter (where c.relrowsecurity)::integer as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'kid_%'
  `
  const [policies] = await sql`
    select count(*)::integer as total
    from pg_policies
    where schemaname = 'public' and tablename like 'kid_%'
  `
  const [functions] = await sql`
    select count(*)::integer as total
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'kids_current_profile_id', 'kids_is_staff', 'kids_is_guardian',
        'kids_guardian_kid_ids', 'claim_kid_delivery_batch'
      )
  `
  const [moduleRow] = await sql`select count(*)::integer as total from public.system_modules where id = 'kids'`
  const [planRows] = await sql`select count(*)::integer as total from public.plan_modules where module_id = 'kids'`
  const [enabledCompanies] = await sql`select count(*)::integer as total from public.company_modules where module_id = 'kids' and enabled = true`
  const [pendingMigration] = await sql`
    select count(*)::integer as total
    from (values ('20260717120000'), ('20260718090000'), ('20260718110000')) expected(version)
    where not exists (
      select 1 from supabase_migrations.schema_migrations applied
      where applied.version = expected.version
    )
  `

  const result = {
    tables: tables.total,
    rlsTables: tables.rls,
    policies: policies.total,
    functions: functions.total,
    moduleRows: moduleRow.total,
    planRows: planRows.total,
    enabledCompanies: enabledCompanies.total,
    pendingKidsMigrations: pendingMigration.total,
  }

  console.log(JSON.stringify(result))

  if (
    result.tables !== 17 || result.rlsTables !== 17 || result.policies < 20 ||
    result.functions !== 5 || result.moduleRows !== 1 || result.planRows !== 0 ||
    result.enabledCompanies !== 0 || result.pendingKidsMigrations !== 0
  ) {
    process.exitCode = 1
  }
} finally {
  await sql.end()
}
