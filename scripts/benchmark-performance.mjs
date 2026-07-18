import postgres from "postgres"

if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")

const sql = postgres(process.env.POSTGRES_URL, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 10,
  prepare: false,
})

try {
  const roundTrips = []
  for (let index = 0; index < 5; index += 1) {
    const startedAt = performance.now()
    await sql`select 1`
    roundTrips.push(Math.round(performance.now() - startedAt))
  }

  const [outbox, kids, extension] = await Promise.all([
    sql`
      select
        count(*)::int as total,
        count(*) filter (where status in ('pending', 'failed'))::int as waiting
      from public.integration_delivery_outbox
    `,
    sql`select count(*)::int as children from public.kid_profiles where deleted_at is null`,
    sql`select exists(select 1 from pg_extension where extname = 'pg_stat_statements') as enabled`,
  ])

  const slowQueries = extension[0]?.enabled
    ? await sql`
        select
          left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 220) as query,
          calls::bigint as calls,
          round(mean_exec_time::numeric, 1) as mean_ms,
          round(total_exec_time::numeric, 1) as total_ms
        from pg_stat_statements
        where dbid = (select oid from pg_database where datname = current_database())
          and calls >= 2
          and query not ilike '%pg_stat_statements%'
        order by total_exec_time desc
        limit 10
      `
    : []
  const cronJobs = await sql`
    select jobname, schedule, active
    from cron.job
    order by jobname
  `.catch(() => [])

  console.log(JSON.stringify({
    dbRoundTripMs: roundTrips,
    outbox: outbox[0],
    kids: kids[0],
    pgStatStatements: extension[0]?.enabled ?? false,
    slowQueries,
    cronJobs,
  }))
} finally {
  await sql.end()
}
