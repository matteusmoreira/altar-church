import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import ts from "typescript"

const ids = Object.fromEntries(["church", "otherChurch", "ministry", "otherMinistry", "foreignMinistry", "member", "peer", "leader", "admin", "outsider", "foreign", "pending", "inactive"].map(key => [key, randomUUID()]))
function sqlAdapter(db) {
  const sql = async (parts, ...values) => {
    const params = values.map(value => value?.__array ? `{${value.__array.join(",")}}` : value)
    return (await db.query(parts.reduce((text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ""), ""), params)).rows
  }
  sql.array = array => ({ __array: array })
  sql.begin = async callback => { await db.exec("begin"); try { const value = await callback(sql); await db.exec("commit"); return value } catch (error) { await db.exec("rollback"); throw error } }
  return sql
}
async function dataModule(path, imports) {
  let source = ts.transpileModule(await readFile(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  source = source.replace(/import "server-only";?/g, "")
  for (const [specifier, replacement] of Object.entries(imports)) source = source.replaceAll(`from "${specifier}"`, `from "${replacement}"`)
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
}
const inline = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`

test("ministry chat: real database RLS and backend messaging/permissions/history", async () => {
  const db = new PGlite()
  const sql = sqlAdapter(db)
  const storedFiles = new Map()
  globalThis.__ministryChatTest = { sql, actor: { id: ids.member, role: "member", churchId: ids.church }, storedFiles, cleanup: [], audits: [] }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table companies(id uuid primary key);
      create table profiles(id uuid primary key,auth_user_id uuid,company_id uuid,name text,role text,roles text[],active boolean default true,deleted_at timestamptz,person_id uuid,avatar_url text);
      create table people(id uuid primary key,profile_id uuid,company_id uuid,is_active boolean default true,status text default 'active',deleted_at timestamptz,photo_file_id uuid);
      create table ministries(id uuid primary key,company_id uuid,name text,slug text,is_active boolean default true,deleted_at timestamptz);
      create table ministry_memberships(ministry_id uuid,company_id uuid,person_id uuid,role text,status text,left_at timestamptz);
      create table notification_push_subscriptions(id uuid primary key default gen_random_uuid(),company_id uuid,person_id uuid not null,endpoint text unique,p256dh text,auth_key text,is_active boolean default true,updated_at timestamptz);
      alter table notification_push_subscriptions enable row level security;
      create table notification_channel_preferences(company_id uuid,person_id uuid,channel text,opted_out boolean);
      create table app_files(id uuid primary key,company_id uuid,storage_path text,is_active boolean,deleted_at timestamptz);
    `)
    await db.exec(await readFile(new URL("../supabase/migrations/20261006225520_ministry_internal_chat.sql", import.meta.url), "utf8"))
    await db.query("insert into companies values($1),($2)", [ids.church, ids.otherChurch])
    for (const [key, company] of [["ministry", ids.church], ["otherMinistry", ids.church], ["foreignMinistry", ids.otherChurch]]) await db.query("insert into ministries(id,company_id,name,slug) values($1,$2,$3,$3)", [ids[key], company, key])
    for (const key of ["member", "peer", "leader", "admin", "outsider", "foreign", "pending", "inactive"]) {
      const company = key === "foreign" ? ids.otherChurch : ids.church
      const role = key === "admin" ? "admin" : "member"
      await db.query("insert into profiles(id,auth_user_id,company_id,name,role,person_id) values($1,$1,$2,$3,$4,$1)", [ids[key], company, key, role])
      await db.query("insert into people(id,profile_id,company_id) values($1,$1,$2)", [ids[key], company])
      if (["member", "peer", "leader", "pending", "inactive"].includes(key)) await db.query("insert into ministry_memberships values($1,$2,$3,$4,$5,null)", [ids.ministry, company, ids[key], key === "leader" ? "leader" : "member", key === "pending" ? "pending" : key === "inactive" ? "inactive" : "active"])
    }
    const contract = await dataModule(new URL("../src/lib/ministries/chat-contract.ts", import.meta.url), { zod: import.meta.resolve("zod") })
    const errors = await dataModule(new URL("../src/lib/api/errors.ts", import.meta.url), { zod: import.meta.resolve("zod") })
    const stubs = inline(`
      export const getSql = () => globalThis.__ministryChatTest.sql;
      export const getCurrentUser = async () => globalThis.__ministryChatTest.actor;
      export const requireUserCompanyId = user => user.churchId;
      export const writeAuditLog = async input => { globalThis.__ministryChatTest.audits.push(input) };
      export const createSignedUrlsByStoragePath = async () => new Map();
      export const consumeRateLimit = async () => ({allowed:true});
      export const afterResponse = (label, task) => { if(label === 'ministry chat cleared attachments') globalThis.__ministryChatTest.cleanup.push(task) };
      export const processMinistryChatPush = async () => {};
      export const createSupabaseAdminClient = () => ({storage:{from:() => ({
        createSignedUploadUrl:async()=>({data:{token:'test'}}),
        download:async path => ({data:globalThis.__ministryChatTest.storedFiles.get(path)}),
        remove:async paths => { paths.forEach(path => globalThis.__ministryChatTest.storedFiles.delete(path)); return {} },
      })}});
      export const resolveMinistryAccess = async id => {
        const user = globalThis.__ministryChatTest.actor;
        const rows = await globalThis.__ministryChatTest.sql\`select role from ministry_memberships where ministry_id=\${id} and person_id=\${user.id} and status='active'\`;
        return { user, companyId:user.churchId, ministryId:id, canManage:user.role==='admin'||['leader','coordinator'].includes(rows[0]?.role) };
      };
    `)
    const imports = Object.fromEntries(["@/lib/auth/server", "@/lib/auth/permissions", "@/lib/db/client", "@/lib/supabase/admin", "@/lib/files/server", "@/lib/security/rate-limit", "@/lib/performance/after-response", "./access", "./chat-push"].map(name => [name, stubs]))
    const api = await import(await dataModule(new URL("../src/lib/ministries/chat-server.ts", import.meta.url), { ...imports, "./chat-contract": contract, "@/lib/api/errors": errors, zod: import.meta.resolve("zod"), "music-metadata": import.meta.resolve("music-metadata") }))
    const as = key => { globalThis.__ministryChatTest.actor = { id: ids[key], role: key === "admin" ? "admin" : "member", churchId: key === "foreign" ? ids.otherChurch : ids.church } }
    const clientId = randomUUID()
    const first = await api.sendMinistryChat(ids.ministry, { clientId, body: "Olá, ministério" })
    assert.equal((await api.sendMinistryChat(ids.ministry, { clientId, body: "tentativa duplicada" })).id, first.id)
    assert.equal((await db.query("select count(*)::int n from ministry_chat_messages")).rows[0].n, 1)
    for (const key of ["outsider", "foreign", "pending", "inactive"]) { as(key); await assert.rejects(api.listMinistryChat(ids.ministry), /acesso/); await assert.rejects(api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Ataque" }), /acesso/) }
    as("member"); await assert.rejects(api.listMinistryChat(ids.otherMinistry), /acesso/)
    as("peer"); assert.equal((await api.listMinistryChats())[0].unread, 1)
    assert.equal((await api.listMinistryChat(ids.ministry)).firstUnreadId, first.id)
    await api.commandMinistryChat(ids.ministry, { action: "read", messageId: first.id })
    assert.equal((await api.listMinistryChats())[0].unread, 0)
    assert.equal((await api.listMinistryChat(ids.ministry)).firstUnreadId, null)
    await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "edit", messageId: first.id, body: "Ataque" }), /negado/)
    await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "delete", messageId: first.id }), /negado/)
    await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "pin", messageId: first.id, pinned: true }), /negado/)
    await api.commandMinistryChat(ids.ministry, { action: "react", messageId: first.id, emoji: "🙏", active: true })
    assert.equal((await api.listMinistryChat(ids.ministry)).messages[0].reactions[0].count, 1)
    await api.commandMinistryChat(ids.ministry, { action: "react", messageId: first.id, emoji: "🙏", active: false })
    assert.equal((await api.listMinistryChat(ids.ministry)).messages[0].reactions.length, 0)
    await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Amém", replyToId: first.id })
    assert.equal((await api.listMinistryChat(ids.ministry)).messages[1].reply.id, first.id)
    as("admin"); const other = await api.sendMinistryChat(ids.otherMinistry, { clientId: randomUUID(), body: "Outro ministério" })
    as("member"); await assert.rejects(api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Resposta cruzada", replyToId: other.id }), /inválida/)
    await api.commandMinistryChat(ids.ministry, { action: "edit", messageId: first.id, body: "Texto editado" })
    assert.ok((await api.listMinistryChat(ids.ministry)).messages[0].editedAt)
    for (let index = 0; index < 55; index++) await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: `Mensagem ${index}` })
    const newest = await api.listMinistryChat(ids.ministry)
    assert.equal(newest.messages.length, 50); assert.ok(newest.nextCursor)
    const older = await api.listMinistryChat(ids.ministry, JSON.stringify(newest.nextCursor))
    assert.equal(older.messages.length, 7); assert.equal(new Set([...older.messages, ...newest.messages].map(message => message.id)).size, 57)
    as("peer"); const latest = newest.messages.at(-1)
    await api.commandMinistryChat(ids.ministry, { action: "read", messageId: latest.id })
    await api.commandMinistryChat(ids.ministry, { action: "read", messageId: first.id })
    assert.equal((await api.listMinistryChats())[0].unread, 0, "reading cannot move backwards")
    as("leader"); for (const message of newest.messages.slice(0, 5)) await api.commandMinistryChat(ids.ministry, { action: "pin", messageId: message.id, pinned: true })
    await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "pin", messageId: newest.messages[5].id, pinned: true }), /cinco/)
    await api.commandMinistryChat(ids.ministry, { action: "delete", messageId: first.id })
    const tombstone = (await api.listMinistryChat(ids.ministry, null, JSON.stringify([first.id]))).messages[0]
    assert.ok(tombstone.deletedAt); assert.equal(tombstone.body, ""); assert.deepEqual(tombstone.attachments, [])
    as("member"); const upload = await api.prepareChatUpload(ids.ministry, { name: "imagem.png", mimeType: "image/png", sizeBytes: 8 })
    as("peer"); await assert.rejects(api.finalizeChatUpload(ids.ministry, upload.id), /não encontrado/)
    as("member"); storedFiles.set(upload.path, new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])]))
    await api.finalizeChatUpload(ids.ministry, upload.id)
    const withFile = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), attachmentIds: [upload.id] })
    assert.equal((await api.listMinistryChat(ids.ministry)).messages.at(-1).attachments.length, 1)
    await assert.rejects(api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), attachmentIds: [upload.id] }), /inválidos/)
    await api.commandMinistryChat(ids.ministry, { action: "delete", messageId: withFile.id })
    await assert.rejects(api.downloadChatFile(ids.ministry, upload.id, null), /não encontrado/)
    const invalid = await api.prepareChatUpload(ids.ministry, { name: "fake.png", mimeType: "image/png", sizeBytes: 6 })
    storedFiles.set(invalid.path, new Blob(["<html>"]))
    await assert.rejects(api.finalizeChatUpload(ids.ministry, invalid.id), /inválido/)
    assert.equal(storedFiles.has(invalid.path), false)
    const pushCalls = []
    globalThis.__ministryChatTest.pushCalls = pushCalls
    const pushStub = inline(`export default {setVapidDetails(){},async sendNotification(subscription,payload){
      if(globalThis.__ministryChatTest.pushError) throw {statusCode:globalThis.__ministryChatTest.pushError};
      globalThis.__ministryChatTest.pushCalls.push(JSON.parse(payload));
    }};`)
    const push = await import(await dataModule(new URL("../src/lib/ministries/chat-push.ts", import.meta.url), { "@/lib/db/client": stubs, "@/lib/supabase/admin": stubs, "./chat-contract": contract, "web-push": pushStub }))
    const env = Object.fromEntries(["VAPID_SUBJECT","NEXT_PUBLIC_VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY"].map(key => [key, process.env[key]]))
    Object.assign(process.env, { VAPID_SUBJECT: "mailto:test@example.invalid", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test", VAPID_PRIVATE_KEY: "test" })
    try {
      const device = randomUUID(), adminDevice = randomUUID()
      await db.query("insert into notification_push_subscriptions(id,company_id,person_id,profile_id,endpoint,p256dh,auth_key) values($1,$2,$3,$3,'https://example.invalid/peer','test','test')", [device, ids.church, ids.peer])
      await db.query("insert into notification_push_subscriptions(id,company_id,person_id,profile_id,endpoint,p256dh,auth_key) values($1,$2,$3,$3,'https://example.invalid/admin','test','test')", [adminDevice, ids.church, ids.admin])
      as("member"); const notify = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Mensagem com push" })
      assert.equal((await db.query("select count(*)::int n from ministry_chat_push_outbox where message_id=$1", [notify.id])).rows[0].n, 1, "admins are not automatically subscribed")
      assert.equal((await push.processMinistryChatPush(25)).sent, 1)
      assert.equal(pushCalls[0].body, "Nova mensagem"); assert.equal(pushCalls[0].url, `/membro/chats?ministry=${ids.ministry}`)
      assert.equal((await push.processMinistryChatPush(25)).processed, 0, "no duplicate claims")
      const readBeforePush = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Já lida" })
      as("peer"); await api.commandMinistryChat(ids.ministry, { action: "read", messageId: readBeforePush.id })
      assert.equal((await push.processMinistryChatPush(25)).sent, 0, "skip messages read before dispatch")
      as("member"); const muteBeforePush = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Silenciada" })
      as("peer"); await api.commandMinistryChat(ids.ministry, { action: "preferences", muted: true })
      assert.equal((await push.processMinistryChatPush(25)).sent, 0)
      assert.equal((await db.query("select status from ministry_chat_push_outbox where message_id=$1", [muteBeforePush.id])).rows[0].status, "canceled")
      await api.commandMinistryChat(ids.ministry, { action: "preferences", muted: false })
      as("member"); const crashed = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Retomar processamento" })
      await db.query("update ministry_chat_push_outbox set status='processing',locked_at=now()-interval '11 minutes' where message_id=$1", [crashed.id])
      assert.equal((await push.processMinistryChatPush(25)).sent, 1, "recover stale processing leases")
      const expired = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Endpoint expirado" })
      globalThis.__ministryChatTest.pushError = 410
      assert.equal((await push.processMinistryChatPush(25)).failed, 1)
      assert.equal((await db.query("select is_active from notification_push_subscriptions where id=$1", [device])).rows[0].is_active, false)
      assert.equal((await db.query("select status from ministry_chat_push_outbox where message_id=$1", [expired.id])).rows[0].status, "canceled")
      delete globalThis.__ministryChatTest.pushError
      await db.query("update notification_push_subscriptions set is_active=true where id=$1", [device])
      const revoked = await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Acesso revogado" })
      await db.query("update ministry_memberships set status='inactive' where person_id=$1", [ids.peer])
      assert.equal((await push.processMinistryChatPush(25)).sent, 0, "recheck membership before push")
      assert.equal((await db.query("select status from ministry_chat_push_outbox where message_id=$1", [revoked.id])).rows[0].status, "canceled")
      await db.query("update ministry_memberships set status='active' where person_id=$1", [ids.peer])
      as("admin"); await api.commandMinistryChat(ids.ministry, { action: "preferences", pushEnabled: true })
      as("member"); await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Administrador inscrito" })
      assert.equal((await push.processMinistryChatPush(25)).sent, 2)
      assert.ok(pushCalls.some(call => call.url === `/ministerios/${ids.ministry}/chat`), "admin push links to the dashboard rather than restricted member portal")
    } finally { for (const [key,value] of Object.entries(env)) { if (value===undefined) delete process.env[key]; else process.env[key]=value } }
    // Browser roles can only read their accessible ministries and cannot mutate directly.
    await db.exec(`set role authenticated; select set_config('test.uid','${ids.member}',false)`)
    assert.deepEqual((await db.query("select distinct ministry_id from ministry_chat_messages")).rows.map(row => row.ministry_id), [ids.ministry])
    await assert.rejects(db.query("update ministry_chat_messages set body='Ataque'"), /permission denied/)
    await assert.rejects(db.query("select * from ministry_chat_attachments"), /permission denied/)
    await assert.rejects(db.query("select * from ministry_chat_push_outbox"), /permission denied/)
    await assert.rejects(db.query("select private.ministry_chat_profile_access($1,$2)", [ids.admin, ids.ministry]), /permission denied/)
    await db.exec("reset role")
    // Clear all pages, including replies/tombstones, without affecting another ministry/church.
    as("member"); await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Aviso pendente" })
    as("peer"); await api.commandMinistryChat(ids.ministry, { action: "preferences", muted: true, pushEnabled: true })
    const foreignMessage = randomUUID()
    await db.query("insert into ministry_chat_messages(id,company_id,ministry_id,sender_profile_id,client_id,body) values($1,$2,$3,$4,$5,'Outra igreja')", [foreignMessage, ids.otherChurch, ids.foreignMinistry, ids.foreign, randomUUID()])
    for (const key of ["member", "peer", "outsider", "foreign", "pending", "inactive"]) {
      as(key); await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "clear" }), /negado|acesso/)
    }
    as("leader"); await assert.rejects(api.commandMinistryChat(ids.otherMinistry, { action: "clear" }), /acesso/)
    const begin = sql.begin
    sql.begin = async callback => {
      await db.query("update ministry_memberships set role='member' where person_id=$1", [ids.leader])
      return begin(callback)
    }
    await assert.rejects(api.commandMinistryChat(ids.ministry, { action: "clear" }), /negado/)
    sql.begin = begin
    await db.query("update ministry_memberships set role='leader' where person_id=$1", [ids.leader])
    assert.ok((await api.listMinistryChat(ids.ministry)).messages.length > 0, "recheck leadership inside the transaction before deletion")
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    const cleared = await api.listMinistryChat(ids.ministry)
    assert.deepEqual(cleared.messages, []); assert.deepEqual(cleared.pinned, []); assert.equal(cleared.nextCursor, null)
    for (const table of ["ministry_chat_messages", "ministry_chat_attachments", "ministry_chat_reactions", "ministry_chat_push_outbox"]) {
      assert.equal((await db.query(`select count(*)::int n from ${table} where ministry_id=$1`, [ids.ministry])).rows[0].n, 0)
    }
    const preferences = (await db.query("select * from ministry_chat_reads where ministry_id=$1 and profile_id=$2", [ids.ministry, ids.peer])).rows[0]
    assert.equal(preferences.muted, true); assert.equal(preferences.push_enabled, true)
    assert.equal(preferences.last_read_at, null); assert.equal(preferences.last_read_id, null)
    assert.equal((await db.query("select count(*)::int n from ministry_chat_messages where id in ($1,$2)", [other.id, foreignMessage])).rows[0].n, 2)
    await assert.rejects(api.downloadChatFile(ids.ministry, upload.id, null), /não encontrado/)
    assert.equal(globalThis.__ministryChatTest.cleanup.length, 1)
    await globalThis.__ministryChatTest.cleanup[0]()
    assert.equal(storedFiles.has(upload.path), false)
    assert.ok(globalThis.__ministryChatTest.audits.some(log => log.action === "ministry.chat.clear" && log.entityId === ids.ministry))
    as("member"); await api.sendMinistryChat(ids.ministry, { clientId: randomUUID(), body: "Conversa nova" })
    as("admin"); assert.equal((await api.listMinistryChat(ids.ministry)).messages[0].body, "Conversa nova")
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    assert.equal((await api.listMinistryChat(ids.ministry)).messages.length, 0)
    await db.query("update ministry_memberships set role='coordinator' where person_id=$1", [ids.peer])
    as("peer"); assert.equal((await api.listMinistryChat(ids.ministry)).canManage, true)
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    as("admin")
    await db.query("update profiles set role='pastor',roles=array['pastor']::text[] where id=$1", [ids.admin])
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    await db.query("update profiles set role='member',roles=array['member','admin']::text[] where id=$1", [ids.admin])
    await db.query("insert into ministry_memberships values($1,$2,$3,'member','active',null)", [ids.ministry, ids.church, ids.admin])
    await api.commandMinistryChat(ids.ministry, { action: "clear" })
    await db.query("update ministry_memberships set status='inactive',left_at=now() where person_id=$1", [ids.member])
    as("member"); await assert.rejects(api.listMinistryChat(ids.ministry), /acesso/)
    await db.exec(`set role authenticated; select set_config('test.uid','${ids.member}',false)`)
    assert.equal((await db.query("select * from ministry_chat_messages")).rows.length, 0)
    await db.exec("reset role")
    await db.query("update profiles set active=false where id=$1", [ids.peer])
    as("peer"); await assert.rejects(api.listMinistryChat(ids.ministry), /acesso/)
  } finally { delete globalThis.__ministryChatTest; await db.close() }
})
