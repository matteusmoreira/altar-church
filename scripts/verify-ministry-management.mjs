import postgres from "postgres"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"

const version="20261008210000"
if(!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")
const sql=postgres(process.env.POSTGRES_URL,{max:1,prepare:false,max_pipeline:1,connect_timeout:10})
try {
  const [base]=await sql`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='person_follow_up_tasks' and column_name='ministry_id') as ministry_scope,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='roles') as multiple_roles,
    exists(select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='ministry_id') as communications_scope`
  if(!base.ministry_scope || !base.multiple_roles || !base.communications_scope) throw new Error("Banco sem pré-requisitos da gestão de ministérios")
  console.log("Pré-requisitos confirmados")
  if(process.argv.includes("--apply")) {
    const contents=await readFile(new URL(`../supabase/migrations/${version}_ministry_management_followups.sql`,import.meta.url),"utf8")
    const checksum=createHash("sha256").update(contents.replace(/\r\n/g,"\n")).digest("hex")
    await sql.begin(async tx=>{
      await tx`select pg_advisory_xact_lock(hashtext('altar-church-migrations'))`
      const existing=await tx`select version from supabase_migrations.schema_migrations where version=${version}`
      if(existing.length) return
      await tx.unsafe(contents)
      await tx`insert into supabase_migrations.schema_migrations(version,name) values(${version},${`ministry_management_followups#sha256:${checksum}`})`
    })
    console.log(`Migration ${version} aplicada/verificada (somente esta migration)`)
  }
  const columns=await sql`select column_name from information_schema.columns where table_schema='public' and table_name='person_follow_up_tasks' and column_name='next_action'`
  const policies=await sql`select permissive,roles,qual,with_check from pg_policies where schemaname='public' and tablename='person_follow_up_tasks' and policyname='ministry_follow_up_management_only'`
  if(!columns.length || policies[0]?.permissive!=="RESTRICTIVE") throw new Error("Migration de gestão ainda não aplicada")
  await sql`select t.next_action from public.person_follow_up_tasks t where false`
  await sql`select r.name,r.roles,r.person_id from public.profiles r where false`
  await sql`select delivered_at from public.notification_deliveries where false`
  console.log("Coluna, política restritiva e consultas compatíveis confirmadas")
} finally {await sql.end()}
