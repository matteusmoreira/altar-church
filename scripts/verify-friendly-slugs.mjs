import fs from "node:fs/promises"
import postgres from "postgres"
import { createHash } from "node:crypto"

const tables = ["people", "ministries", "forms", "events", "notifications", "kid_classrooms", "kid_session_classrooms"]
if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false, max_pipeline: 1 })
try {
  if (process.argv.includes("--preflight")) {
    const rows = await sql`select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = any(${tables})
      and column_name in ('id','company_id','slug','public_slug','deleted_at','full_name','title','name','created_at') order by table_name,column_name`
    console.log(JSON.stringify({ columns: rows }))
    const triggers = await sql`select c.relname as table_name, t.tgname, p.proname as function_name
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any(${tables}) and not t.tgisinternal order by c.relname,t.tgname`
    console.log(JSON.stringify({ triggers }))
    const pending = await sql`select version from supabase_migrations.schema_migrations order by version desc limit 3`
    console.log(JSON.stringify({ latestMigrations: pending }))
  } else {
    async function audit(tx) {
      const results = []
      for (const table of tables) {
        const [row] = await tx.unsafe(`select count(*)::int as total,
          count(*) filter (where slug is null or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(slug)>80)::int as invalid,
          count(*) filter (where not exists (select 1 from route_private.slug_reservations r
            where r.company_id=t.company_id and r.kind=$1 and r.entity_id=t.id and r.slug=t.slug))::int as unreserved
          from public.${table} t`, [table])
        if (row.invalid || row.unreserved) throw new Error(`Slug audit failed: ${table}`)
        results.push({ table, ...row })
      }
      const grants = await tx`select role,
        has_schema_privilege(role, 'route_private', 'USAGE') as schema_access,
        has_table_privilege(role, 'route_private.slug_reservations','SELECT') as can_read,
        has_function_privilege(role, 'route_private.assign_entity_slug()', 'EXECUTE') as can_call
        from unnest(array['anon','authenticated']) role`
      if (grants.some(row => row.schema_access || row.can_read || row.can_call)) throw new Error("Unexpected client grants")
      console.log(JSON.stringify({ audit: results, grants }))
    }
    if (process.argv.includes("--apply")) {
      const version = "20261006225400"
      const source = await fs.readFile(new URL(`../supabase/migrations/${version}_friendly_entity_slugs.sql`, import.meta.url), "utf8")
      const checksum = createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex")
      await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtext('altar-church-migrations'))`
        const existing = await tx`select version from supabase_migrations.schema_migrations where version=${version}`
        if (!existing.length) {
          await tx.unsafe(source)
          await tx`insert into supabase_migrations.schema_migrations(version,name) values(${version},${`friendly_entity_slugs#sha256:${checksum}`})`
        }
        await audit(tx)
      })
      console.log("Friendly slug migration applied and verified")
    } else if (process.argv.includes("--rehearse")) {
      const source = await fs.readFile(new URL("../supabase/migrations/20261006225400_friendly_entity_slugs.sql", import.meta.url), "utf8")
      try {
        await sql.begin(async tx => {
          const [before] = await tx`select count(*)::int n from public.automation_events`
          await tx.unsafe(source)
          await audit(tx)
          const [after] = await tx`select count(*)::int n from public.automation_events`
          if (before.n !== after.n) throw new Error("Backfill enqueued automation events")
          console.log("Rehearsal successful; rolling back all changes")
          throw new Error("SLUG_REHEARSAL_ROLLBACK")
        })
      } catch (error) { if (error.message !== "SLUG_REHEARSAL_ROLLBACK") throw error }
    } else await audit(sql)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { await sql.end() }
