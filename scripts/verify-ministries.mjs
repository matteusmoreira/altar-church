import postgres from "postgres"

const connectionString = process.env.POSTGRES_URL
if (!connectionString) throw new Error("POSTGRES_URL obrigatorio")
const sql = postgres(connectionString, { max: 1 })

try {
  const migration = await sql.unsafe("select version from supabase_migrations.schema_migrations where version = '20260801090000'")
  const columns = await sql.unsafe(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('ministries','ministry_memberships','groups','programmings','events','person_follow_up_tasks','ministry_resources')
      and column_name in ('ministry_type','mission','target_audience','meeting_day','meeting_time','meeting_location','image_file_id','public_join_enabled','left_at','ministry_id')
    order by table_name, column_name
  `)
  const functions = await sql.unsafe(`
    select routine_name
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in ('ministry_current_profile_id','ministry_current_person_id','can_access_ministry','can_manage_ministry','can_manage_ministry_team')
    order by routine_name
  `)
  const policies = await sql.unsafe(`
    select tablename, count(*)::int as count
    from pg_policies
    where schemaname = 'public'
      and tablename in ('groups','group_members','programmings','events','attendance_records','person_follow_up_tasks')
    group by tablename order by tablename
  `)
  const counts = await sql.unsafe(`
    select
      (select count(*) from public.ministries where deleted_at is null)::int as ministries,
      (select count(*) from public.ministry_memberships)::int as memberships,
      (select count(*) from public.groups where type = 'ministry' and deleted_at is null)::int as ministry_groups,
      (select count(*) from public.events where ministry_id is not null and deleted_at is null)::int as ministry_events
  `)
  console.log(JSON.stringify({ migration, columns, functions, policies, counts }, null, 2))
} finally {
  await sql.end()
}
