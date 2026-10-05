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
    create table notifications(id uuid primary key,company_id uuid,title text default 'Aviso',content text default 'Mensagem',status text default 'queued',deleted_at timestamptz,completed_at timestamptz,updated_at timestamptz default now());
    create table notification_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid,company_id uuid,person_id uuid,channel text default 'push',recipient text default 'https://push.test/device',recipient_name text default 'Membro',status text default 'pending',attempts integer default 0,next_attempt_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now(),locked_at timestamptz,last_error text,provider_id text,response_status integer,sent_at timestamptz,delivered_at timestamptz);
    create table notification_push_subscriptions(id uuid primary key default gen_random_uuid(),company_id uuid,person_id uuid,endpoint text unique,p256dh text,auth_key text,user_agent text,is_active boolean,updated_at timestamptz default now());
    create table notification_channel_preferences(company_id uuid,person_id uuid,channel text,opted_out boolean);
    create table volunteer_push_subscriptions(company_id uuid,profile_id uuid,volunteer_id uuid,endpoint text,p256dh text,auth_key text,user_agent text,is_active boolean);
    create table people(id uuid primary key,company_id uuid,profile_id uuid,deleted_at timestamptz,is_active boolean,status text);
    create table profiles(id uuid,company_id uuid,person_id uuid);
    create table volunteer_profiles(id uuid,company_id uuid,person_id uuid,deleted_at timestamptz);
    insert into people values('${person}','${tenant}',null,null,true,'member');
    insert into notifications(id,company_id) values('${campaign}','${tenant}');
  `)
  await db.exec(readFileSync("supabase/migrations/20261005185046_notification_push_queue_recovery.sql", "utf8"))
  await db.exec(readFileSync("supabase/migrations/20261005185525_notification_worker_execute_permissions.sql", "utf8"))
  const sql = async (strings, ...values) => (await db.query(strings.reduce((query, part, index) => query + part + (index < values.length ? `$${index + 1}` : ""), ""), values)).rows
  const sent = []
  let providerError = null
  const delivery = load("src/lib/notifications/delivery.ts", {
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/auth/phone": { toUazapiNumber: (value) => value },
    "@/lib/delivery/retry-policy": { isPermanentProviderError: () => false },
    "web-push": { setVapidDetails() {}, async sendNotification(...args) { sent.push(args); if (providerError) throw providerError } },
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

test("service worker displays malformed text push instead of losing the notification", async () => {
  const handlers = {}, notifications = []
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self: { addEventListener: (name, fn) => { handlers[name] = fn }, registration: { showNotification: async (...args) => { notifications.push(args) } } }, URL })
  let work
  handlers.push({ data: { json() { throw new SyntaxError("not JSON") }, text: () => "Aviso da igreja" }, waitUntil: (promise) => { work = promise } })
  await work
  assert.equal(notifications[0][1].body, "Aviso da igreja")
  assert.equal(notifications[0][1].icon, "/icons/icon-192.png")
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
    assert.equal((await preferences.saveMyNotificationPushSubscription(input, false)).ok, false)
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
