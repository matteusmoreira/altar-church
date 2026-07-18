import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatorio")

const sql = postgres(connectionString, { max: 1, idle_timeout: 5 })

try {
  const [database] = await sql`
    select
      version() as version,
      pg_database_size(current_database())::bigint as size_bytes,
      case when blks_hit + blks_read = 0 then 1
        else round(blks_hit::numeric / (blks_hit + blks_read), 6)
      end as cache_hit_ratio,
      xact_commit::bigint,
      xact_rollback::bigint,
      deadlocks::bigint,
      temp_bytes::bigint
    from pg_stat_database
    where datname = current_database()
  `

  const tables = await sql`
    select
      relname as table_name,
      pg_total_relation_size(relid)::bigint as total_bytes,
      n_live_tup::bigint as live_rows,
      n_dead_tup::bigint as dead_rows,
      seq_scan::bigint,
      idx_scan::bigint,
      last_analyze,
      last_autoanalyze,
      last_autovacuum
    from pg_stat_user_tables
    where schemaname = 'public'
    order by pg_total_relation_size(relid) desc
  `

  const invalidIndexes = await sql`
    select ns.nspname as schema_name, tbl.relname as table_name, idx.relname as index_name
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    join pg_class tbl on tbl.oid = i.indrelid
    join pg_namespace ns on ns.oid = tbl.relnamespace
    where ns.nspname = 'public' and (not i.indisvalid or not i.indisready)
    order by tbl.relname, idx.relname
  `

  const duplicateIndexes = await sql`
    select table_name, array_agg(index_name order by index_name) as indexes
    from (
      select
        tbl.relname as table_name,
        idx.relname as index_name,
        i.indrelid,
        i.indkey,
        i.indclass,
        i.indcollation,
        coalesce(pg_get_expr(i.indexprs, i.indrelid), '') as expressions,
        coalesce(pg_get_expr(i.indpred, i.indrelid), '') as predicate
      from pg_index i
      join pg_class idx on idx.oid = i.indexrelid
      join pg_class tbl on tbl.oid = i.indrelid
      join pg_namespace ns on ns.oid = tbl.relnamespace
      where ns.nspname = 'public' and i.indisvalid
    ) indexes
    group by table_name, indrelid, indkey, indclass, indcollation, expressions, predicate
    having count(*) > 1
    order by table_name
  `

  const missingForeignKeyIndexes = await sql`
    select
      c.conrelid::regclass::text as table_name,
      c.conname as constraint_name,
      array_agg(a.attname order by keys.ordinality) as columns
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as keys(attnum, ordinality)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = keys.attnum
    join pg_namespace ns on ns.oid = c.connamespace
    where c.contype = 'f'
      and ns.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and c.conkey <@ (
            i.indkey::smallint[]
          )[0:cardinality(c.conkey)-1]
      )
    group by c.conrelid, c.conname
    order by c.conrelid::regclass::text, c.conname
  `

  const rlsGaps = await sql`
    select c.relname as table_name, c.relrowsecurity as rls_enabled, count(p.policyname)::int as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname, c.relrowsecurity
    having not c.relrowsecurity or count(p.policyname) = 0
    order by c.relname
  `

  const longRunningQueries = await sql`
    select pid, usename, state, now() - query_start as duration, left(query, 180) as query
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and state <> 'idle'
      and query_start < now() - interval '30 seconds'
    order by query_start
  `

  const staleStats = tables.filter((table) => {
    const live = Number(table.live_rows)
    const dead = Number(table.dead_rows)
    return dead >= 1000 && dead / Math.max(live + dead, 1) >= 0.1
  })

  const hottestTables = tables
    .filter((table) => Number(table.live_rows) > 0)
    .sort((a, b) => Number(b.seq_scan) - Number(a.seq_scan))
    .slice(0, 15)

  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    database,
    counts: {
      publicTables: tables.length,
      invalidIndexes: invalidIndexes.length,
      duplicateIndexGroups: duplicateIndexes.length,
      missingForeignKeyIndexes: missingForeignKeyIndexes.length,
      rlsGaps: rlsGaps.length,
      staleStats: staleStats.length,
      longRunningQueries: longRunningQueries.length,
    },
    invalidIndexes,
    duplicateIndexes,
    missingForeignKeyIndexes,
    rlsGaps,
    staleStats,
    largestTables: tables.slice(0, 15),
    hottestTables,
    longRunningQueries,
  }, null, 2))
} finally {
  await sql.end()
}
