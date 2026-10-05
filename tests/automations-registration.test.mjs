import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { automationFixture, A, B, U, P, I } from "./helpers/automation-fixture.mjs";

const C = "71000000-0000-4000-8000-000000000001";
const PHONE = "11988888888", CHAT = `55${PHONE}@s.whatsapp.net`;
async function setup(t) {
  let fixture;
  const auth = { calls: 0, mode: "ok", inputs: [] };
  fixture = await automationFixture({ "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ auth: { admin: {
    async createUser(input) {
      auth.calls++;
      auth.inputs.push(input);
      if (auth.mode === "timeout") throw new TypeError("network");
      if (auth.mode === "reject") return { error: { status: 422 }, data: { user: null } };
      const rows = (await fixture.db.query("insert into auth.users(email,raw_app_meta_data) values($1,$2) returning id", [input.email, input.app_metadata])).rows;
      if (auth.mode === "accepted_timeout") throw new TypeError("network");
      return { data: { user: rows[0] }, error: null };
    },
  } } }) } });
  t.after(() => fixture.db.close());
  await fixture.db.exec(`create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_app_meta_data jsonb);
    create unique index profiles_email_test_unique on profiles(lower(email));
    create unique index profiles_phone_test_unique on profiles(login_phone) where login_phone is not null;`);
  await fixture.db.exec(readFileSync("supabase/migrations/20261005195628_automation_whatsapp_registration.sql", "utf8"));
  await fixture.db.query("insert into congregations(id,company_id,name,is_active) values($1,$2,'Central',true)", [C, A]);
  await fixture.db.query("insert into automation_webhook_secrets(instance_id,company_id,secret_hash) values($1,$2,$3)", [I, A, createHash("sha256").update("test-secret").digest("hex")]);
  const { registrationTemplate } = fixture.load("src/lib/automations/templates.ts");
  const definition = registrationTemplate();
  definition.nodes.forEach(n => { if (["trigger", "question", "whatsapp"].includes(n.kind)) n.config.instanceId = I; });
  const flow = await fixture.flow(definition);
  const webhook = fixture.load("src/lib/automations/webhook.ts").receiveAutomationWebhook;
  async function inbound(text, id = crypto.randomUUID(), chat = CHAT) {
    return webhook(I, "test-secret", { EventType: "messages", message: { messageid: id, chatid: chat, text } });
  }
  const messages = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    messages.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ messageid: `out-${messages.length}` }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = oldFetch; });
  async function run() { return (await fixture.db.query("select * from automation_runs where flow_id=$1 order by created_at desc", [flow.id])).rows[0]; }
  async function registrationRun(context = {}, personId = null) {
    const rows = (await fixture.db.query("insert into automation_runs(company_id,flow_id,version_id,person_id,event_key,node_id,status,lease_token,context) values($1,$2,$3,$4,$5,'register','working',gen_random_uuid(),$6) returning *",
      [A, flow.id, flow.published_version_id, personId, crypto.randomUUID(), { chat_id: CHAT, cadastro_nome: "Maria Silva", cadastro_email: "maria@example.test", cadastro_congregacao: C, ...context }])).rows;
    return rows[0];
  }
  return { ...fixture, createFlow: fixture.flow, auth, definition, flow, inbound, messages, run, registrationRun, register: fixture.load("src/lib/automations/registration.ts").registerAutomationPerson, registrationNode: definition.nodes.find(n => n.kind === "register_person") };
}

test("keyword, answer validation, congregation buttons/list/pagination and graph contracts", async t => {
  const f = await setup(t);
  const { matchesKeyword, validateQuestionAnswer, congregationQuestion } = f.load("src/lib/automations/questions.ts");
  const { validateFlow, requiredPorts } = f.load("src/lib/automations/contract.ts");
  assert.equal(matchesKeyword(" CADASTRO ", "cadastro"), true);
  assert.equal(matchesKeyword("quero fazer cadastro", "cadastro"), false);
  assert.equal(matchesKeyword("qualquer coisa"), true);
  assert.ok(validateQuestionAnswer("full_name", "Ana").error);
  assert.equal(validateQuestionAnswer("full_name", " João  D’Ávila ").value, "João D’Ávila");
  assert.ok(validateQuestionAnswer("email", "nao-email").error);
  assert.equal(validateQuestionAnswer("email", " ANA@EXAMPLE.TEST ").value, "ana@example.test");
  for (const count of [1, 3, 4, 10, 11, 20]) {
    const choices = Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Congregação ${i}` }));
    const { message, fallbackText } = congregationQuestion("Escolha", choices);
    assert.equal(message.type, count <= 3 ? "button" : "list");
    assert.ok(fallbackText.includes("1. Congregação 0"));
    if (message.type === "list") assert.ok(message.sections[0].items.length <= 10);
    if (count > 10) {
      assert.equal(validateQuestionAnswer("congregation", "__next", choices, 0).page, 1);
      assert.equal(validateQuestionAnswer("congregation", "1", choices, 1).value, "8");
      assert.ok(validateQuestionAnswer("congregation", "0", choices, 1).error);
    }
  }
  assert.throws(() => congregationQuestion("Escolha", []), /Nenhuma congregação/);
  assert.deepEqual(validateFlow(f.definition), []);
  assert.deepEqual(requiredPorts(f.registrationNode), ["next", "error"]);
  const invalid = structuredClone(f.definition);
  invalid.nodes[0].config.filter = { congregationId: C };
  assert.ok(validateFlow(invalid).some(i => i.message.includes("Filtros")));
  invalid.nodes[0].config.filter = {};
  invalid.nodes.find(n => n.id === "email").config.answerVariable = "cadastro_nome";
  assert.ok(validateFlow(invalid).length);
});

test("new WhatsApp completes separate questions and registration; duplicate webhook never duplicates access", async t => {
  const f = await setup(t);
  await f.inbound("quero fazer cadastro");
  assert.equal(await f.run(), undefined);
  await f.inbound(" CADASTRO ", "initial");
  await f.inbound(" CADASTRO ", "initial");
  await f.runtime.processAutomations(20);
  let run = await f.run();
  assert.equal(run.person_id, null);
  assert.equal(run.wait_kind, "question");
  assert.equal(run.node_id, "name");
  await f.inbound("Maria");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "name");
  assert.equal(f.messages.length, 2);
  await f.inbound("Maria Silva");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).context.cadastro_nome, "Maria Silva");
  await f.inbound("nao-email");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "email");
  await f.inbound("MARIA@EXAMPLE.TEST");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "congregation");
  await f.inbound(C, "selected");
  await f.inbound(C, "selected");
  await f.runtime.processAutomations(20);
  run = await f.run();
  assert.equal(run.status, "completed");
  assert.ok(run.person_id);
  assert.equal(f.auth.calls, 1);
  assert.equal(f.auth.inputs[0].password, "@mudar123");
  const person = (await f.db.query("select p.*,pr.role,pr.login_phone from people p join profiles pr on pr.id=p.profile_id where p.id=$1", [run.person_id])).rows[0];
  assert.equal(person.email, "maria@example.test");
  assert.equal(person.phone, PHONE);
  assert.equal(person.login_phone, PHONE);
  assert.equal(person.congregation_id, C);
  assert.equal(person.role, "member");
  assert.equal(JSON.stringify(run.context).includes("@mudar123"), false);
  assert.equal(JSON.stringify((await f.db.query("select * from automation_steps")).rows).includes("@mudar123"), false);
  assert.equal((await f.db.query("select count(*)::int as n from automation_runs")).rows[0].n, 1);
});

test("old message trigger ignores unknown contacts, still starts for known people", async t => {
  const f = await setup(t);
  const legacy = { schemaVersion: 1, nodes: [f.newNode("trigger", "start"), f.newNode("end", "end")], edges: [{ id: "next", source: "start", target: "end", port: "next" }] };
  legacy.nodes[0].config = { mode: "message", instanceId: I };
  await f.db.query("update automation_flows set status='paused' where id=$1", [f.flow.id]);
  await f.createFlow(legacy);
  await f.inbound("oi");
  assert.equal((await f.db.query("select count(*)::int as n from automation_runs")).rows[0].n, 0);
  await f.inbound("oi", "known", "5511999999999@s.whatsapp.net");
  assert.equal((await f.db.query("select person_id from automation_runs")).rows[0].person_id, P);
});

test("existing person keeps populated data and password; missing access is created once", async t => {
  const f = await setup(t);
  await f.db.query("update people set phone=$1,email='existing@example.test',full_name='Nome Preservado' where id=$2", [PHONE, P]);
  const run = await f.registrationRun({}, P);
  const result = await f.register(run, f.registrationNode, U);
  assert.equal(result.personId, P);
  assert.equal(f.auth.inputs[0].email, "existing@example.test");
  assert.equal(result.nome, "Nome Preservado");
  await f.register(run, f.registrationNode, U);
  assert.equal(f.auth.calls, 1);
  const second = await f.registrationRun({ cadastro_nome: "Outro Nome", cadastro_email: "outro@example.test" }, P);
  await f.register(second, f.registrationNode, U);
  assert.equal(f.auth.calls, 1);
  assert.equal((await f.db.query("select email from people where id=$1", [P])).rows[0].email, "existing@example.test");
});

test("conflicts and foreign or disabled congregations never create identities", async t => {
  const f = await setup(t);
  const other = (await f.db.query("insert into congregations(company_id,name,is_active) values($1,'Outra',true) returning id", [B])).rows[0].id;
  await assert.rejects(f.register(await f.registrationRun({ cadastro_congregacao: other }), f.registrationNode, U), /Congregação/);
  await f.db.query("insert into profiles(company_id,email,login_phone,active) values($1,'maria@example.test','21988888888',true)", [B]);
  await assert.rejects(f.register(await f.registrationRun(), f.registrationNode, U), /outro acesso/);
  assert.equal(f.auth.calls, 0);
  await f.db.query("delete from profiles where company_id=$1", [B]);
  await f.db.query("insert into people(company_id,full_name,phone,is_active) values($1,'Pessoa Um',$2,true),($1,'Pessoa Dois',$2,true)", [A, PHONE]);
  await assert.rejects(f.register(await f.registrationRun(), f.registrationNode, U), /ambíguo/);
  assert.equal(f.auth.calls, 0);
});

test("uncertain Auth result recovers its own identity without another create call", async t => {
  const f = await setup(t);
  f.auth.mode = "accepted_timeout";
  const run = await f.registrationRun();
  await assert.rejects(f.register(run, f.registrationNode, U), /reconciliar/);
  assert.equal((await f.db.query("select status from automation_registrations")).rows[0].status, "creating");
  const result = await f.register(run, f.registrationNode, U);
  assert.ok(result.personId);
  assert.equal(f.auth.calls, 1);
  assert.equal((await f.db.query("select count(*)::int as n from auth.users")).rows[0].n, 1);
});

test("unconfirmed creation stays in review and never adopts an existing email identity", async t => {
  const f = await setup(t);
  f.auth.mode = "timeout";
  const run = await f.registrationRun();
  await assert.rejects(f.register(run, f.registrationNode, U), /reconciliar/);
  await f.db.query("insert into auth.users(email,raw_app_meta_data) values('maria@example.test','{}')");
  await assert.rejects(f.register(run, f.registrationNode, U), /reconciliar/);
  assert.equal(f.auth.calls, 1);
  assert.equal((await f.db.query("select count(*)::int as n from people where phone=$1", [PHONE])).rows[0].n, 0);
});

test("SQL failure after Auth rolls back links; retry reuses the prepared identity", async t => {
  const f = await setup(t);
  const run = await f.registrationRun();
  await f.db.exec("alter table people add constraint reject_registration_test check(email is distinct from 'maria@example.test')");
  await assert.rejects(f.register(run, f.registrationNode, U), /reconciliar/);
  assert.equal((await f.db.query("select count(*)::int as n from profiles where email='maria@example.test'")).rows[0].n, 0);
  await f.db.exec("alter table people drop constraint reject_registration_test");
  await f.register(run, f.registrationNode, U);
  assert.equal(f.auth.calls, 1);
});

test("simulator validates separate fields without creating users", async t => {
  const f = await setup(t);
  const { advanceSimulation } = f.load("src/lib/automations/simulation.ts");
  const congregations = [{ id: C, name: "Central" }];
  let state = { nodeId: "start", context: {}, entries: [] };
  state = advanceSimulation(f.definition, state, { audienceMatches: true });
  const invalid = advanceSimulation(f.definition, state, { response: "Ana", congregations });
  assert.equal(invalid.nodeId, "name");
  assert.ok(invalid.error);
  for (const response of ["Ana Silva", "ana@example.test", C]) state = advanceSimulation(f.definition, state, { response, congregations });
  assert.equal(state.nodeId, "register");
  state = advanceSimulation(f.definition, state, { congregations });
  assert.equal(state.nodeId, "confirmation");
  assert.match(state.entries.at(-1).detail, /nenhum usuário foi criado/);
  assert.equal(f.auth.calls, 0);
  assert.equal((await f.db.query("select count(*)::int as n from auth.users")).rows[0].n, 0);
});

test("paginated congregation question falls back to numbered text and stores selected ID", async t => {
  const f = await setup(t);
  await f.db.query("insert into congregations(company_id,name,is_active) select $1,'Filial '||lpad(i::text,2,'0'),true from generate_series(1,11) i", [A]);
  const queued = await f.registrationRun();
  await f.db.query("update automation_runs set status='ready',lease_token=null,node_id='congregation' where id=$1", [queued.id]);
  let attempts = 0;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    f.messages.push(body);
    attempts++;
    return url.endsWith("/send/text") ? new Response(JSON.stringify({ messageid: `fallback-${attempts}` }), { status: 200 }) : new Response("unsupported", { status: 400 });
  };
  await f.runtime.processAutomations(20);
  assert.match(f.messages.at(-1).text, /Digite “próxima”/);
  assert.equal((await f.run()).node_id, "congregation");
  await f.inbound("próxima");
  await f.runtime.processAutomations(20);
  const page = await f.run();
  assert.equal(page.context.question_page, 1);
  const chosen = page.context.question_choices[8].id;
  await f.inbound("1");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).context.cadastro_congregacao, chosen);
  assert.equal((await f.run()).status, "completed");
});

test("inactive selection, missing congregation and question timeout follow their configured paths", async t => {
  const f = await setup(t);
  const queued = await f.registrationRun();
  await f.db.query("update automation_runs set status='ready',lease_token=null,node_id='congregation' where id=$1", [queued.id]);
  await f.runtime.processAutomations(20);
  await f.db.query("update congregations set is_active=false where id=$1", [C]);
  await f.inbound(C);
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "error");
  assert.equal(f.auth.calls, 0);
  const second = await f.registrationRun();
  await f.db.query("update automation_runs set status='ready',lease_token=null,node_id='congregation' where id=$1", [second.id]);
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "error");
  const third = await f.registrationRun();
  await f.db.query("update automation_runs set status='ready',lease_token=null,node_id='name' where id=$1", [third.id]);
  await f.runtime.processAutomations(20);
  await f.db.query("update automation_runs set due_at=now()-interval '1 minute' where id=$1", [third.id]);
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "timeout");
  assert.equal(f.auth.calls, 0);
});

test("question response during delivery survives the send/wait boundary; opt-out cancels", async t => {
  const f = await setup(t);
  await f.inbound("cadastro");
  let first = true;
  globalThis.fetch = async (_url, init) => {
    f.messages.push(JSON.parse(init.body));
    if (first) { first = false; await f.inbound("Maria Silva", "early-answer"); }
    return new Response(JSON.stringify({ messageid: `out-${f.messages.length}` }), { status: 200 });
  };
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).node_id, "email");
  assert.equal((await f.run()).context.cadastro_nome, "Maria Silva");
  await f.inbound("sair");
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).status, "canceled");
  assert.equal(f.auth.calls, 0);
});

test("reconciliation action confirms only owned Auth identities and enforces tenant permissions", async t => {
  const f = await setup(t);
  const { reconcileAutomationRegistration } = f.load("src/lib/automations/actions.ts");
  f.auth.mode = "accepted_timeout";
  const queued = await f.registrationRun();
  await f.db.query("update automation_runs set status='ready',lease_token=null where id=$1", [queued.id]);
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).status, "review");
  f.permissions.denied.add("automations.operate");
  await assert.rejects(reconcileAutomationRegistration(queued.id), /Acesso negado/);
  f.permissions.denied.clear();
  await reconcileAutomationRegistration(queued.id);
  await f.runtime.processAutomations(20);
  assert.equal((await f.run()).status, "completed");
  assert.equal(f.auth.calls, 1);
  const foreign = await f.createFlow(f.definition, B);
  const other = (await f.db.query("insert into automation_runs(company_id,flow_id,version_id,event_key,node_id,status) values($1,$2,$3,'foreign','register','review') returning id", [B, foreign.id, foreign.published_version_id])).rows[0].id;
  await assert.rejects(reconcileAutomationRegistration(other), /precisa estar em revisão/);
});

test("registration checkpoint table is inaccessible to authenticated and anonymous clients", async t => {
  const f = await setup(t);
  const result = (await f.db.query("select has_table_privilege('authenticated','public.automation_registrations','select') as member,has_table_privilege('anon','public.automation_registrations','insert') as anon,(select relrowsecurity from pg_class where oid='public.automation_registrations'::regclass) as rls")).rows[0];
  assert.equal(result.member, false);
  assert.equal(result.anon, false);
  assert.equal(result.rls, true);
});

test("draft confirmation test accepts guest variables and sends only to the explicit test number", async t => {
  const f = await setup(t);
  const { sendAutomationDraftTest } = f.load("src/lib/automations/actions.ts");
  const confirmation = f.definition.nodes.find(n => n.id === "confirmation");
  confirmation.config.message.text = "Olá, {{cadastro_nome}}!";
  const result = await sendAutomationDraftTest({ definition: f.definition, nodeId: confirmation.id, requestId: crypto.randomUUID(),
    instanceId: I, phone: "21999999999", personId: "guest", context: { cadastro_nome: "Maria Silva" } });
  assert.equal(result.status, "accepted");
  assert.equal(f.messages.at(-1).number, "5521999999999@s.whatsapp.net");
  assert.equal(f.messages.at(-1).text, "Olá, Maria Silva!");
  assert.equal(f.auth.calls, 0);
});
