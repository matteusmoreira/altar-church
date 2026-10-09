import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"

const require = createRequire(import.meta.url)
const tenant = "10000000-0000-4000-8000-000000000001"
const otherTenant = "10000000-0000-4000-8000-000000000002"
const campaign = "20000000-0000-4000-8000-000000000001"
const person = "30000000-0000-4000-8000-000000000001"

function load(file, mocks) {
  const loadedModule = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  new Function("require", "module", "exports", code)((name) => name in mocks ? mocks[name] : require(name), loadedModule, loadedModule.exports)
  return loadedModule.exports
}

async function fixture() {
  const db = new PGlite()
  await db.exec(`
    create role service_role;
    create role anon;
    create role authenticated;
    alter default privileges grant execute on functions to anon, authenticated;
    create table notifications(id uuid primary key,company_id uuid,title text default 'Aviso',content text default 'Mensagem',method text default 'push',scheduled_send boolean default false,scheduled_at timestamptz,status text default 'queued',whatsapp_message jsonb,deleted_at timestamptz,completed_at timestamptz,updated_at timestamptz default now());
    create table notification_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid,company_id uuid,person_id uuid,channel text default 'push',recipient text default 'https://push.test/device',recipient_name text default 'Membro',status text default 'pending',attempts integer default 0,next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now(),locked_at timestamptz,last_error text,provider_id text,response_status integer,sent_at timestamptz,delivered_at timestamptz);
    create table notification_push_subscriptions(id uuid primary key default gen_random_uuid(),company_id uuid,person_id uuid,profile_id uuid,endpoint text unique,p256dh text,auth_key text,user_agent text,is_active boolean,updated_at timestamptz default now());
    create table notification_channel_preferences(company_id uuid,person_id uuid,channel text,opted_out boolean);
    create table volunteer_push_subscriptions(company_id uuid,profile_id uuid,volunteer_id uuid,endpoint text,p256dh text,auth_key text,user_agent text,is_active boolean);
    create table app_files(id uuid primary key,company_id uuid,bucket text,storage_path text,mime_type text,is_active boolean,deleted_at timestamptz);
    create table people(id uuid primary key,company_id uuid,profile_id uuid,deleted_at timestamptz,is_active boolean,status text);
    create table profiles(id uuid,company_id uuid,person_id uuid);
    create table volunteer_profiles(id uuid,company_id uuid,person_id uuid,deleted_at timestamptz);
    insert into people values('${person}','${tenant}',null,null,true,'member');
    insert into notifications(id,company_id) values('${campaign}','${tenant}');
    create function public.get_company_uazapi_credential(p_company_id uuid) returns table (instance_id uuid, provider_instance_id text, base_url text, instance_token text) language sql as $$ select null::uuid, 'stub'::text, 'https://uazapi.test'::text, 'token-test'::text $$;
  `)
  await db.exec(readFileSync("supabase/migrations/20261005185046_notification_push_queue_recovery.sql", "utf8"))
  await db.exec(readFileSync("supabase/migrations/20261005185525_notification_worker_execute_permissions.sql", "utf8"))
  const sql = async (strings, ...values) => (await db.query(strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), ""), values)).rows
  sql.array = (values) => values
  sql.begin = (callback) => db.transaction(async (tx) => {
    const transactionSql = async (strings, ...values) => (await tx.query(strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), ""), values)).rows
    return callback(transactionSql)
  })
  const sent = []
  let providerError = null
  const delivery = load("src/lib/notifications/delivery.ts", {
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/auth/phone": { toUazapiNumber: (value) => value },
    "@/lib/delivery/retry-policy": { isPermanentProviderError: () => false },
    "web-push": { setVapidDetails() {}, async sendNotification(...args) { sent.push(args); if (providerError) throw providerError } },
    "@/lib/forms/direct-message": load("src/lib/forms/direct-message.ts", {}),
    "@/lib/files/server": { createSignedUrlsByStoragePath: async (paths) => new Map(paths.map((path) => [path, `https://signed.test/${path}`])) },
  })
  return { db, sql, delivery, sent, failWith: (error) => { providerError = error } }
}

test("claim recovers expired locks, respects tenant/campaign scope, schedules and cancellations", async () => {
  const { db } = await fixture()
  try {
    const permissions = await db.query("select has_function_privilege('anon','claim_notification_delivery_batch(integer,uuid,uuid)','execute') as anon,has_function_privilege('authenticated','claim_notification_delivery_batch(integer)','execute') as authenticated")
    assert.equal(permissions.rows[0].anon, false)
    assert.equal(permissions.rows[0].authenticated, false)
    await db.exec(`
      insert into notifications(id,company_id,status) values('20000000-0000-4000-8000-000000000002','${otherTenant}','queued'),('20000000-0000-4000-8000-000000000003','${tenant}','canceled');
      insert into notification_deliveries(notification_id,company_id,status,attempts,locked_at) values('${campaign}','${tenant}','processing',2,now()-interval '20 minutes'),('${campaign}','${tenant}','processing',8,now()-interval '20 minutes');
      insert into notification_deliveries(notification_id,company_id,next_attempt_at) values('${campaign}','${tenant}',now()+interval '1 day');
      insert into notification_deliveries(notification_id,company_id) values('20000000-0000-4000-8000-000000000002','${otherTenant}'),('20000000-0000-4000-8000-000000000003','${tenant}');
    `)
    const { rows } = await db.query("select * from claim_notification_delivery_batch(25,$1::uuid,$2::uuid)", [campaign, tenant])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].attempts, 3)
    assert.equal(rows[0].status, "processing")
    const dead = await db.query("select count(*)::int as count from notification_deliveries where status='dead'")
    assert.equal(dead.rows[0].count, 1)
    const legacy = await db.query("select * from claim_notification_delivery_batch(25)")
    assert.equal(legacy.rows.length, 1)
    assert.equal(legacy.rows[0].company_id, otherTenant)
  } finally { await db.close() }
})

test("manual retry resets exhausted attempts and cannot revive a canceled campaign", async () => {
  const { db, delivery } = await fixture()
  try {
    const { rows } = await db.query(`insert into notification_deliveries(notification_id,company_id,status,attempts) values($1,$2,'dead',8) returning id`, [campaign, tenant])
    assert.ok(await delivery.retryNotificationDelivery(rows[0].id, tenant))
    assert.equal((await db.query("select attempts from notification_deliveries")).rows[0].attempts, 0)
    await db.exec("update notifications set status='canceled'; update notification_deliveries set status='dead'")
    assert.equal(await delivery.retryNotificationDelivery(rows[0].id, tenant), null)
    assert.equal(await delivery.retryNotificationDelivery(rows[0].id, otherTenant), null)
  } finally { await db.close() }
})

test("push dispatch sends the registered device, expires invalid endpoints and rechecks opt-out", async () => {
  const { db, delivery, sent, failWith } = await fixture()
  const keys = ["VAPID_SUBJECT", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]
  const before = keys.map((key) => process.env[key])
  keys.forEach((key) => { process.env[key] = "mock-config" })
  try {
    await db.query("insert into notification_push_subscriptions(company_id,person_id,endpoint,p256dh,auth_key,is_active) values($1,$2,'https://push.test/device','mock-key','mock-auth',true)", [tenant, person])
    const add = () => db.query("insert into notification_deliveries(notification_id,company_id,person_id) values($1,$2,$3)", [campaign, tenant, person])
    await add()
    assert.deepEqual(await delivery.processNotificationOutbox(25, campaign, tenant), { processed: 1, sent: 1, failed: 0, dead: 0 })
    assert.equal(sent[0][2].TTL, 86400)
    assert.equal(sent[0][2].timeout, 15000)
    assert.equal(JSON.parse(sent[0][1]).url, "/membro")
    await db.query("insert into notification_channel_preferences values($1,$2,'push',true)", [tenant, person])
    await add()
    const skipped = await delivery.processNotificationOutbox(25, campaign, tenant)
    assert.equal(skipped.processed, 1)
    assert.equal(skipped.sent, 0)
    assert.equal(sent.length, 1)
    await db.exec("delete from notification_channel_preferences")
    failWith(Object.assign(new Error("Subscription expired"), { statusCode: 410 }))
    await add()
    assert.equal((await delivery.processNotificationOutbox(25, campaign, tenant)).dead, 1)
    assert.equal((await db.query("select is_active from notification_push_subscriptions")).rows[0].is_active, false)
  } finally {
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index] })
    await db.close()
  }
})

test("campanha whatsapp com botões envia menu e cai para texto quando o provedor recusa", async () => {
  const { db, delivery } = await fixture()
  const calls = []
  const originalFetch = global.fetch
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    const refuse = calls.length === 1
    return { ok: !refuse, status: refuse ? 400 : 200, json: async () => ({}) }
  }
  try {
    await db.query("update notifications set content='Fallback simples', whatsapp_message=$2::jsonb where id=$1", [campaign, JSON.stringify({
      type: "button", text: "Oi {{primeiro_nome}}, tudo bem?", footer: "Igreja",
      buttons: [{ label: "Sim", action: "reply", value: "sim" }],
    })])
    await db.query("insert into notification_deliveries(notification_id,company_id,channel,recipient,recipient_name) values($1,$2,'whatsapp','11987654321','Ana Silva')", [campaign, tenant])
    assert.deepEqual(await delivery.processNotificationOutbox(25, campaign, tenant), { processed: 1, sent: 1, failed: 0, dead: 0 })
    assert.equal(calls.length, 2)
    assert.ok(calls[0].url.endsWith("/send/menu"))
    assert.equal(calls[0].body.type, "button")
    assert.equal(calls[0].body.text, "Oi Ana, tudo bem?")
    assert.equal(calls[0].body.footerText, "Igreja")
    assert.deepEqual(calls[0].body.choices, ["Sim|sim"])
    assert.ok(calls[1].url.endsWith("/send/text"))
    assert.equal(calls[1].body.text, "Fallback simples")
  } finally {
    global.fetch = originalFetch
    await db.close()
  }
})

test("campanha whatsapp de carrossel assina a mídia da própria igreja", async () => {
  const { db, delivery } = await fixture()
  const calls = []
  const originalFetch = global.fetch
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return { ok: true, status: 200, json: async () => ({ id: "msg-carousel" }) }
  }
  try {
    const fileId = "50000000-0000-4000-8000-000000000001"
    await db.query("insert into app_files(id,company_id,bucket,storage_path,mime_type,is_active) values($1,$2,'church-assets','whatsapp/cartao.png','image/png',true)", [fileId, tenant])
    await db.query("update notifications set content='Novidades', whatsapp_message=$2::jsonb where id=$1", [campaign, JSON.stringify({
      type: "carousel", text: "Olha as novidades, {{nome}}",
      cards: [{ text: "Cartão 1", mediaFileId: fileId, mediaType: "image", filename: "cartao.png", buttons: [{ label: "Quero", action: "reply", value: "quero" }] }],
    })])
    await db.query("insert into notification_deliveries(notification_id,company_id,channel,recipient,recipient_name) values($1,$2,'whatsapp','11987654321','Ana Silva')", [campaign, tenant])
    assert.deepEqual(await delivery.processNotificationOutbox(25, campaign, tenant), { processed: 1, sent: 1, failed: 0, dead: 0 })
    assert.equal(calls.length, 1)
    assert.ok(calls[0].url.endsWith("/send/carousel"))
    assert.equal(calls[0].body.text, "Olha as novidades, Ana Silva")
    assert.equal(calls[0].body.carousel[0].image, "https://signed.test/whatsapp/cartao.png")
    assert.deepEqual(calls[0].body.carousel[0].buttons, [{ id: "quero", text: "Quero", type: "REPLY" }])
  } finally {
    global.fetch = originalFetch
    await db.close()
  }
})

test("service worker displays malformed text push instead of losing the notification", async () => {
  const handlers = {}, notifications = []
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self: { addEventListener: (name, fn) => { handlers[name] = fn }, registration: { showNotification: async (...args) => { notifications.push(args) } } }, URL })
  let work
  handlers.push({ data: { json() { throw new SyntaxError("not JSON") }, text: () => "Aviso da igreja" }, waitUntil: (promise) => { work = promise } })
  await work
  assert.equal(notifications[0][1].body, "Aviso da igreja")
  assert.equal(notifications[0][1].icon, "/brand/altar/altar-church_simbolo_escuro_v1.png")
  assert.equal(notifications[0][1].badge, "/brand/altar/altar-church_simbolo_escuro_v1.png")
  const badge = readFileSync(`public${notifications[0][1].badge}`)
  assert.equal(badge[25], 6, "notification mark must be RGBA, with transparency for the Android mask")
})

test("push registration requires a live person in the authenticated tenant", async () => {
  const { db, sql } = await fixture()
  const profile = "40000000-0000-4000-8000-000000000001"
  try {
    await db.query("insert into profiles values($1,$2,$3)", [profile, tenant, person])
    const preferences = load("src/lib/notifications/preferences.ts", {
      "@/lib/db/client": { getSql: () => sql },
      "@/lib/auth/server": { getCurrentUser: async () => ({ id: profile }), requireUserCompanyId: () => tenant },
      "@/lib/auth/permissions": { writeAuditLog: async () => {} },
    })
    const input = { endpoint: "https://push.test/new-device", p256dh: "public-device-key-long-enough", auth: "auth-key-long-enough" }
    assert.equal((await preferences.saveMyNotificationPushSubscription(input)).ok, true)
    assert.equal((await db.query("select person_id from notification_push_subscriptions")).rows[0].person_id, person)
    await db.exec("update people set deleted_at=now()")
    await assert.rejects(() => preferences.saveMyNotificationPushSubscription(input), /pessoa ativa/)
    assert.equal((await preferences.saveMyNotificationPushSubscription(input, false)).ok, true)
    const profileDevice = (await db.query("select person_id,profile_id,company_id from notification_push_subscriptions")).rows[0]
    assert.equal(profileDevice.person_id, null)
    assert.equal(profileDevice.company_id, tenant)
    assert.ok(profileDevice.profile_id, "profile-only chat device remains bound to its authenticated profile")
    await db.exec(`update people set deleted_at=null,company_id='${otherTenant}'`)
    await assert.rejects(() => preferences.saveMyNotificationPushSubscription(input), /pessoa ativa/)
  } finally { await db.close() }
})

test("worker diagnostics require authentication and never claim or send deliveries", async () => {
  const before = [process.env.NOTIFICATION_WORKER_SECRET, process.env.INTEGRATION_WORKER_SECRET]
  delete process.env.NOTIFICATION_WORKER_SECRET
  process.env.INTEGRATION_WORKER_SECRET = "mock-worker-secret"
  let dispatched = 0
  const route = load("src/app/api/internal/notifications/dispatch/route.ts", {
    "@/lib/db/client": { getSql: () => async () => [] },
    "@/lib/notifications/delivery": { processNotificationOutbox: async () => { dispatched++; return { processed: 0 } } },
  })
  const request = (method, valid, body) => new Request("https://app.test/api/internal/notifications/dispatch", {
    method, headers: { "x-notification-worker-secret": valid ? "mock-worker-secret" : "wrong-secret", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  try {
    assert.equal((await route.GET(request("GET", false))).status, 401)
    const result = await route.GET(request("GET", true))
    assert.equal(result.status, 200)
    assert.equal((await result.json()).data.dryRun, true)
    assert.equal((await route.POST(request("POST", true, { dryRun: true }))).status, 200)
    assert.equal(dispatched, 0)
    assert.equal((await route.POST(request("POST", true, { batchSize: 1 }))).status, 200)
    assert.equal(dispatched, 1)
  } finally {
    for (const [index, key] of ["NOTIFICATION_WORKER_SECRET", "INTEGRATION_WORKER_SECRET"].entries()) {
      if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]
    }
  }
})

test("immediate push anticipates schedules, scopes the campaign and does not duplicate an open dispatch", async () => {
  const { db, delivery } = await fixture()
  try {
    await db.exec(`update notifications set status='scheduled',scheduled_send=true,scheduled_at=now()+interval '1 day';
      insert into notification_deliveries(notification_id,company_id,person_id,next_attempt_at) values('${campaign}','${tenant}','${person}',now()+interval '1 day');`)
    assert.equal(await delivery.prepareImmediatePush(campaign, tenant), 1)
    const ready = (await db.query('select status,scheduled_send,scheduled_at from notifications')).rows[0]
    assert.equal(ready.status, 'queued')
    assert.equal(ready.scheduled_send, false)
    assert.equal(ready.scheduled_at, null)
    assert.equal((await db.query('select * from claim_notification_delivery_batch(25,$1,$2)', [campaign, tenant])).rows.length, 1)
    assert.equal(await delivery.prepareImmediatePush(campaign, tenant), 0)
    await assert.rejects(() => delivery.prepareImmediatePush(campaign, otherTenant), /não encontrada/)
    await db.exec("update notifications set status='canceled'; update notification_deliveries set status='failed'")
    await assert.rejects(() => delivery.prepareImmediatePush(campaign, tenant), /cancelada/)
    assert.equal((await db.query('select status from notification_deliveries')).rows[0].status, 'failed')
    await db.exec("update notifications set status='queued', method='whatsapp'")
    await assert.rejects(() => delivery.prepareImmediatePush(campaign, tenant), /não encontrada/)
  } finally { await db.close() }
})

test("repeat push resets receipts only after a completed campaign; inactive people are not sent push", async () => {
  const { db, delivery, sent } = await fixture()
  const keys = ['VAPID_SUBJECT', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
  const before = keys.map(key => process.env[key])
  keys.forEach(key => { process.env[key] = 'mock-config' })
  try {
    await db.exec(`update notifications set status='completed';
      insert into notification_deliveries(notification_id,company_id,person_id,status,attempts,provider_id,sent_at) values('${campaign}','${tenant}','${person}','sent',1,'old-receipt',now());
      insert into notification_push_subscriptions(company_id,person_id,endpoint,p256dh,auth_key,is_active) values('${tenant}','${person}','https://push.test/device','device-key','auth-key',true);`)
    assert.equal(await delivery.prepareImmediatePush(campaign, tenant), 1)
    const reset = (await db.query('select status,provider_id,sent_at,attempts from notification_deliveries')).rows[0]
    assert.equal(reset.provider_id, null)
    assert.equal(reset.sent_at, null)
    assert.equal(reset.attempts, 0)
    assert.equal((await delivery.processNotificationOutbox(25, campaign, tenant)).sent, 1)
    assert.equal(sent.length, 1)
    await db.exec("update notifications set status='processing'")
    assert.equal(await delivery.prepareImmediatePush(campaign, tenant), 0)
    await db.exec("update notifications set status='completed'; update people set is_active=false")
    assert.equal(await delivery.prepareImmediatePush(campaign, tenant), 1)
    assert.equal((await delivery.processNotificationOutbox(25, campaign, tenant)).sent, 0)
    assert.equal(sent.length, 1)
    assert.equal((await db.query('select status from notification_deliveries')).rows[0].status, 'canceled')
  } finally {
    keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i] })
    await db.close()
  }
})

test("manual push action checks permission and reports awaited provider failures", async () => {
  let authorized = true, prepared = 0, dispatches = 0
  const keys = ['VAPID_SUBJECT', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
  const before = keys.map(key => process.env[key])
  keys.forEach(key => { process.env[key] = 'mock-config' })
  const actions = load('src/lib/notifications/actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/auth/server': { getCurrentUser: async () => ({ id: 'profile' }), requireUserCompanyId: () => tenant },
    '@/lib/auth/permissions': { requirePermission: async (permission, companyId) => { assert.equal(permission, 'notification.send'); assert.equal(companyId, tenant); if (!authorized) throw new Error('Acesso negado') }, writeAuditLog: async () => {} },
    '@/lib/db/client': {}, '@/lib/performance/after-response': {},
    './delivery': { prepareImmediatePush: async (id, companyId) => { assert.equal(id, campaign); assert.equal(companyId, tenant); prepared++; return 2 }, processNotificationOutbox: async (batch, id, companyId) => { assert.equal(id, campaign); assert.equal(companyId, tenant); dispatches++; return { processed: 2, sent: 1, failed: 1, dead: 0 } } },
  })
  const form = new FormData(); form.set('notificationId', campaign)
  try {
    authorized = false
    assert.equal((await actions.dispatchNotificationPushAction(form)).error, 'Acesso negado')
    assert.equal(prepared, 0)
    authorized = true
    const result = await actions.dispatchNotificationPushAction(form)
    assert.equal(result.ok, false)
    assert.match(result.message, /1 push aceito.*1 falha/)
    assert.equal(dispatches, 1)
    delete process.env.VAPID_PRIVATE_KEY
    assert.match((await actions.dispatchNotificationPushAction(form)).error, /VAPID/)
    assert.equal(prepared, 1)
  } finally { keys.forEach((key, i) => { if (before[i] === undefined) delete process.env[key]; else process.env[key] = before[i] }) }
})
