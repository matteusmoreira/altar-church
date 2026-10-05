import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { automationFixture, A, I } from "./helpers/automation-fixture.mjs";

const C = "71000000-0000-4000-8000-000000000001";
const secret = "e".repeat(64);
const nameOf = i => `Pessoa Teste ${[676, 26, 1].map(d => String.fromCharCode(65 + Math.floor(i / d) % 26)).join("")}`;
const chat = i => `55119${String(i).padStart(8, "0")}@s.whatsapp.net`;
async function setup(t) {
  let f;
  let identities = 0;
  f = await automationFixture({ "next/server": { NextResponse: { json: Response.json } }, "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ auth: { admin: {
    async createUser(input) {
      identities++;
      const [user] = (await f.db.query("insert into auth.users(email,raw_app_meta_data) values($1,$2) returning id", [input.email, input.app_metadata])).rows;
      return { data: { user }, error: null };
    },
  } } }) } }, { queue: true });
  t.after(() => f.db.close());
  await f.db.exec(`create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_app_meta_data jsonb);
    create unique index profiles_queue_email on profiles(lower(email));
    create unique index profiles_queue_phone on profiles(login_phone) where login_phone is not null;`);
  await f.db.exec(readFileSync("supabase/migrations/20261005195628_automation_whatsapp_registration.sql", "utf8"));
  await f.db.query("insert into congregations(id,company_id,name,is_active) values($1,$2,'Central',true)", [C, A]);
  await f.db.query("insert into automation_webhook_secrets(instance_id,company_id,secret_hash) values($1,$2,$3)", [I, A, createHash("sha256").update(secret).digest("hex")]);
  const definition = f.load("src/lib/automations/templates.ts").registrationTemplate();
  for (const node of definition.nodes) if (["trigger", "question", "whatsapp"].includes(node.kind)) node.config.instanceId = I;
  const flow = await f.flow(definition);
  const queue = f.load("src/lib/automations/queue.ts");
  const messages = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    messages.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messageid: `sent-${messages.length}` }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  const inbound = (i, text, id = `${i}:${text}`) => queue.enqueueAutomationWebhook(I, secret, { EventType: "messages", message: { messageid: id, chatid: chat(i), text } });
  return { ...f, queue, flow, inbound, messages, identities: () => identities };
}

test("durable inbox: authentication, dedupe, rollback after receipt, ordered answers and expired leases", async t => {
  const f = await setup(t);
  f.queue.reserveAutomationSend = async () => {};
  await assert.rejects(f.queue.enqueueAutomationWebhook(I, "wrong", {}), /UNAUTHORIZED/);
  await Promise.all(Array.from({ length: 20 }, () => f.inbound(1, "cadastro")));
  assert.equal((await f.db.query("select count(*)::int n from automation_inbox")).rows[0].n, 1);
  assert.equal((await f.db.query("select count(*)::int n from automation_runs")).rows[0].n, 0);
  // Force failure AFTER receipt insertion. The receipt and start must roll back together.
  await f.db.exec("alter table automation_runs add constraint queue_fail_test check(event_key not like 'inbound:%')");
  await f.queue.processAutomationInbox(50, 4);
  assert.equal((await f.db.query("select count(*)::int n from automation_webhook_receipts")).rows[0].n, 0);
  assert.equal((await f.db.query("select status from automation_inbox")).rows[0].status, "pending");
  await f.db.exec("alter table automation_runs drop constraint queue_fail_test; update automation_inbox set due_at=now()");
  const [leased] = (await f.db.query("select * from claim_automation_inbox()")).rows;
  assert.ok(leased.lease_token);
  assert.equal((await f.db.query("select * from claim_automation_inbox()")).rows.length, 0);
  await f.db.exec("update automation_inbox set lease_until=now()-interval '1 second'");
  await f.runtime.processAutomations(50, { concurrency: 4 });
  await f.inbound(1, "Pessoa Um");
  await f.inbound(1, "um@example.test");
  await f.inbound(1, C);
  for (let i = 0; i < 4; i++) await f.runtime.processAutomations(50, { concurrency: 4 });
  const [run] = (await f.db.query("select * from automation_runs")).rows;
  assert.equal(run.status, "completed");
  assert.equal(run.context.cadastro_nome, "Pessoa Um");
  assert.equal(run.context.cadastro_email, "um@example.test");
  assert.equal(f.identities(), 1);
  assert.equal((await f.db.query("select count(*)::int n from automation_inbox where status<>'processed'")).rows[0].n, 0);
  assert.equal((await f.db.query("select count(*)::int n from automation_inbox where event is not null")).rows[0].n, 0);
  const privileges = (await f.db.query("select has_function_privilege('anon','public.claim_automation_inbox()','EXECUTE') a, has_table_privilege('authenticated','public.automation_inbox','SELECT') b")).rows[0];
  assert.deepEqual(privileges, { a: false, b: false });
});

test("instance pacing and 429 retries preserve the same prompt; unconfirmed send never retries", async t => {
  const f = await setup(t);
  await f.queue.reserveAutomationSend(I);
  await assert.rejects(f.queue.reserveAutomationSend(I), e => e instanceof f.queue.DeferredAutomationDelivery);
  await f.db.exec("update automation_send_slots set next_at=now()-interval '1 second'");
  await f.queue.reserveAutomationSend(I);
  // Control the clock at the send boundary only; HTTP refusal and retry state remain real.
  f.queue.reserveAutomationSend = async () => {};
  await f.inbound(2, "cadastro");
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("{}", { status: 429, headers: { "retry-after": "2" } }); };
  await f.runtime.processAutomations(30, { concurrency: 4 });
  let [run] = (await f.db.query("select * from automation_runs")).rows;
  assert.equal(run.status, "ready");
  assert.ok(new Date(run.due_at) > new Date());
  assert.equal(calls, 1);
  assert.equal(run.context.question_prompt.text, "Qual é seu nome completo?");
  globalThis.fetch = async () => { calls++; throw new TypeError("network interrupted"); };
  await f.db.exec("update automation_runs set due_at=now()");
  await f.runtime.processAutomations(30, { concurrency: 4 });
  [run] = (await f.db.query("select * from automation_runs")).rows;
  assert.equal(run.status, "review");
  await f.runtime.processAutomations(30, { concurrency: 4 });
  assert.equal(calls, 2);
  assert.equal((await f.db.query("select attempts,status from automation_deliveries")).rows[0].attempts, 2);
});

test("overlapping workers respect real instance pacing without starving the batch or duplicating prompts", async t => {
  const f = await setup(t);
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    sent.push({ at: performance.now(), number: JSON.parse(init.body).number });
    return new Response(JSON.stringify({ messageid: `paced-${sent.length}` }), { status: 200 });
  };
  await Promise.all(Array.from({ length: 8 }, (_, i) => f.inbound(i, "cadastro")));
  await Promise.all([f.runtime.processAutomations(30, { concurrency: 2 }), f.runtime.processAutomations(30, { concurrency: 2 })]);
  assert.equal(sent.length, 8);
  assert.equal(new Set(sent.map(m => m.number)).size, 8);
  for (let i = 1; i < sent.length; i++) assert.ok(sent[i].at - sent[i - 1].at >= 200, "instance sends must be spaced apart");
  assert.equal((await f.db.query("select count(*)::int n from automation_runs where status='waiting' and node_id='name'")).rows[0].n, 8);
});

test("repeated connection states update after a disconnect rather than being deduplicated forever", async t => {
  const f = await setup(t);
  for (const status of ["connected", "disconnected", "connected"]) {
    await f.queue.enqueueAutomationWebhook(I, secret, { EventType: "connection", instance: { status } });
    await f.queue.processAutomationInbox();
    assert.equal((await f.db.query("select status from uazapi_instances where id=$1", [I])).rows[0].status, status);
  }
});

test("HTTP routes acknowledge persisted messages, expose authenticated health and return 503 when persistence fails", async t => {
  const f = await setup(t);
  const webhook = f.load("src/app/api/webhooks/automations/[instanceId]/[secret]/route.ts");
  const dispatch = f.load("src/app/api/internal/automations/dispatch/route.ts");
  const oldSecret = process.env.AUTOMATION_WORKER_SECRET;
  process.env.AUTOMATION_WORKER_SECRET = secret;
  t.after(() => { if (oldSecret === undefined) delete process.env.AUTOMATION_WORKER_SECRET; else process.env.AUTOMATION_WORKER_SECRET = oldSecret; });
  const params = { params: Promise.resolve({ instanceId: I, secret }) };
  const request = () => new Request("https://example.test/webhook", { method: "POST", body: JSON.stringify({ EventType: "messages", message: { messageid: "http-inbound", chatid: chat(1), text: "cadastro" } }) });
  const response = await webhook.POST(request(), params);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, queued: true });
  assert.equal((await f.db.query("select count(*)::int n from automation_runs")).rows[0].n, 0);
  assert.equal((await dispatch.GET(new Request("https://example.test/dispatch"))).status, 401);
  assert.equal((await dispatch.GET(new Request("https://example.test/dispatch", { headers: { "x-automation-worker-secret": "é".repeat(64) } }))).status, 401);
  const healthy = await dispatch.GET(new Request("https://example.test/dispatch", { headers: { "x-automation-worker-secret": secret } }));
  assert.equal(healthy.status, 200);
  assert.equal((await healthy.json()).schemaReady, true);
  await f.db.exec("drop table automation_inbox cascade");
  assert.equal((await webhook.POST(request(), params)).status, 503);
  assert.equal((await dispatch.GET(new Request("https://example.test/dispatch", { headers: { "x-automation-worker-secret": secret } }))).status, 503);
});

test("burst: 1500 conversations complete name/email/congregation, one access each and isolated confirmations", { timeout: 600000 }, async t => {
  const f = await setup(t);
  // The load test measures the actual queue/runtime/SQL; provider/Auth and waiting time are simulated.
  f.queue.reserveAutomationSend = async () => {};
  const total = 1500, start = performance.now();
  async function burst(answer, suffix) {
    for (let offset = 0; offset < total; offset += 50) {
      await Promise.all(Array.from({ length: Math.min(50, total - offset) }, async (_, j) => {
        const i = offset + j;
        await f.inbound(i, answer(i), `${i}:${suffix}`);
        await f.inbound(i, answer(i), `${i}:${suffix}`);
      }));
    }
  }
  async function drain(expectedStatus, node) {
    for (let tick = 0; tick < 30; tick++) {
      await f.runtime.processAutomations(5000, { concurrency: 4 });
      const [row] = (await f.db.query("select count(*)::int n from automation_runs where flow_id=$1 and status=$2 and ($3::text is null or node_id=$3)", [f.flow.id, expectedStatus, node ?? null])).rows;
      if (row.n === total) return;
    }
    assert.fail(`Queue did not reach ${expectedStatus}/${node}`);
  }
  await burst(() => "cadastro", "start");
  await drain("waiting", "name");
  const firstResponsesMs = performance.now() - start;
  await burst(i => nameOf(i), "name");
  await drain("waiting", "email");
  await burst(i => `carga-${i}@example.test`, "email");
  await drain("waiting", "congregation");
  await burst(() => C, "congregation");
  await drain("completed");
  assert.equal(f.identities(), total);
  for (const table of ["automation_runs", "automation_registrations", "auth.users"])
    assert.equal((await f.db.query(`select count(*)::int n from ${table}`)).rows[0].n, total);
  assert.equal((await f.db.query("select count(*)::int n from automation_inbox")).rows[0].n, total * 4);
  assert.equal((await f.db.query("select count(*)::int n from automation_inbox where status<>'processed'")).rows[0].n, 0);
  assert.equal((await f.db.query("select count(*)::int n from automation_runs r join people p on p.id=r.person_id join profiles pr on pr.id=p.profile_id join auth.users u on u.id=pr.auth_user_id where p.email=u.email and pr.email=p.email and pr.login_phone=p.phone and p.congregation_id=$1 and pr.role='member'", [C])).rows[0].n, total);
  assert.equal(f.messages.length, total * 4);
  for (let i = 0; i < total; i++) {
    const outgoing = f.messages.filter(m => m.number === chat(i));
    assert.equal(outgoing.length, 4);
    assert.ok(outgoing[3].text.includes("Pessoa, seu cadastro foi concluído"));
    const [row] = (await f.db.query("select p.email,p.full_name from automation_runs r join people p on p.id=r.person_id where r.context->>'chat_id'=$1", [chat(i)])).rows;
    assert.equal(row.email, `carga-${i}@example.test`);
    assert.equal(row.full_name, nameOf(i));
  }
  const report = { conversations: total, receivedUnique: total * 4, receivedIncludingDuplicates: total * 8,
    completed: total, accesses: f.identities(), confirmations: total, sends: f.messages.length,
    firstResponsesMs: Math.round(firstResponsesMs), totalMs: Math.round(performance.now() - start),
    database: "local PGlite PostgreSQL", provider: "simulated", auth: "simulated", pacing: "clock bypassed; tested separately",
    cloudCapacityProven: false };
  mkdirSync(".codex-local/automation-queue", { recursive: true });
  writeFileSync(".codex-local/automation-queue/load-result.json", JSON.stringify(report, null, 2));
  t.diagnostic(JSON.stringify(report));
});
