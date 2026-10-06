import fs from "node:fs/promises"
import crypto from "node:crypto"
import postgres from "postgres"

if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL obrigatória")
const sql = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false, max_pipeline: 1 })
const tables = ["ministry_chat_messages", "ministry_chat_attachments", "ministry_chat_reactions", "ministry_chat_reads", "ministry_chat_push_outbox"]
try {
  if (process.argv.includes("--preflight")) {
    console.log(JSON.stringify({ columns: await sql`select table_name,column_name,data_type,is_nullable from information_schema.columns
      where table_schema='public' and table_name in ('notification_push_subscriptions','people','profiles','ministries')
      and column_name in ('id','company_id','person_id','profile_id','role','active','is_active','status','deleted_at') order by table_name,column_name` }))
    console.log(JSON.stringify({ subscriptionConstraints: await sql`select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.notification_push_subscriptions'::regclass` }))
  } else {
    if (process.argv.includes("--apply")) {
      const file = "20261006225520_ministry_internal_chat"
      const contents = await fs.readFile(`supabase/migrations/${file}.sql`, "utf8")
      const stamp = file.slice(0, 14)
      const checksum = crypto.createHash("sha256").update(contents.replace(/\r\n/g, "\n")).digest("hex")
      await sql.begin(async tx => {
        await tx`select pg_advisory_xact_lock(hashtext('altar-church-migrations'))`
        if ((await tx`select version from supabase_migrations.schema_migrations where version=${stamp}`)[0]) return
        await tx.unsafe(contents)
        await tx`insert into supabase_migrations.schema_migrations(version,name) values(${stamp},${`${file.slice(15)}#sha256:${checksum}`})`
      })
      console.log("Migration do chat aplicada/verificada; migrations de outras tarefas preservadas")
    }
    const rls = await sql`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(${tables}) order by c.relname`
    const grants = await sql`select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name=any(${tables}) and grantee in ('anon','authenticated') order by table_name,privilege_type`
    const publication = await sql`select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename=any(${tables}) order by tablename`
    const functions = await sql`select p.proname,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'ministry_chat_%' order by p.proname`
    const bucket = await sql`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='ministry-chat-assets'`
    const queue = await sql`select status,count(*)::int total from public.ministry_chat_push_outbox group by status`
    const counts = await sql`select (select count(*)::int from public.ministry_chat_messages) messages,(select count(*)::int from public.ministry_chat_attachments) attachments`
    console.log(JSON.stringify({ rls, grants, publication, functions, bucket, queue, counts, pushConfigured: Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY), workerConfigured: Boolean(process.env.INTEGRATION_WORKER_SECRET) }, null, 2))
    if (rls.length !== tables.length || rls.some(row => !row.relrowsecurity)) throw new Error("RLS incompleto")
    if (publication.length !== 3) throw new Error("Publicação Realtime incompleta")
    if (grants.some(row => row.grantee==='anon' || row.privilege_type!=='SELECT' || ['ministry_chat_attachments','ministry_chat_push_outbox'].includes(row.table_name))) throw new Error("Grants excessivos")
    if (functions.some(row => row.anon_execute || (row.proname==='ministry_chat_profile_access' && row.authenticated_execute))) throw new Error("Grants de funções excessivos")
    if (!bucket[0] || bucket[0].public) throw new Error("Bucket privado não verificado")
  }
} finally { await sql.end() }
