import test from "node:test";
import assert from "node:assert/strict";
import { automationFixture, A, B, P, I } from "./helpers/automation-fixture.mjs";

const definition = {
  schemaVersion: 1,
  nodes: [
    { id: "start", kind: "trigger", label: "Início", position: { x: 0, y: 0 }, config: { mode: "manual" } },
    { id: "end", kind: "end", label: "Fim", position: { x: 0, y: 200 }, config: {} },
  ],
  edges: [{ id: "a", source: "start", target: "end", port: "next" }],
};

test("template edits persist, reject stale revisions and never restore deleted templates", async () => {
  const { db, load, permissions } = await automationFixture();
  try {
    const actions = load("src/lib/automations/actions.ts");
    const input = { id: "birthday", name: "Novo aniversário", definition, revision: 0 };
    const saved = await actions.saveAutomationTemplate(input);
    assert.equal(saved.revision, 1);
    assert.equal((await db.query("select name from automation_templates where company_id=$1", [A])).rows[0].name, input.name);
    await assert.rejects(actions.saveAutomationTemplate(input), /outra aba/);
    await actions.saveAutomationTemplate({ ...input, revision: 1, name: "Modelo atualizado" });
    await actions.deleteAutomationTemplate(input.id);
    await assert.rejects(actions.saveAutomationTemplate({ ...input, revision: 2 }), /outra aba/);
    assert.ok((await db.query("select deleted_at from automation_templates")).rows[0].deleted_at);
    permissions.denied.add("automations.edit");
    await assert.rejects(actions.deleteAutomationTemplate("visitor"), /Acesso negado/);
    await assert.rejects(actions.clearAutomationHistory(), /Acesso negado/);
    await assert.rejects(actions.deleteAutomation("60000000-0000-4000-8000-000000000001"), /Acesso negado/);
  } finally { await db.close(); }
});

test("flow deletion removes dependencies atomically and protects other tenants and working runs", async () => {
  const { db, load, flow, runtime } = await automationFixture();
  try {
    const actions = load("src/lib/automations/actions.ts");
    const own = await flow(definition), other = await flow(definition, B);
    await assert.rejects(actions.deleteAutomation(other.id), /não encontrado/);
    await runtime.enqueueAutomationRun(own, P, "manual:test", {});
    const run = (await db.query("select id from automation_runs where flow_id=$1", [own.id])).rows[0].id;
    await db.query("insert into automation_tasks(company_id,run_id,node_id,title) values($1,$2,'task','Acompanhar')", [A, run]);
    await db.query("insert into automation_deliveries(company_id,run_id,node_id,instance_id,chat_id,message,status) values($1,$2,'message',$3,'5511999999999@s.whatsapp.net','{}','sending')", [A, run, I]);
    await assert.rejects(actions.deleteAutomation(own.id), /Pause o fluxo/);
    await db.query("update automation_deliveries set status='sent' where run_id=$1", [run]);
    await db.query("update automation_runs set status='working' where id=$1", [run]);
    await assert.rejects(actions.deleteAutomation(own.id), /Pause o fluxo/);
    await db.query("update automation_runs set status='waiting' where id=$1", [run]);
    await actions.deleteAutomation(own.id);
    for (const table of ["automation_runs", "automation_versions", "automation_tasks", "automation_deliveries"])
      assert.equal((await db.query(`select count(*)::int as n from ${table} where company_id=$1`, [A])).rows[0].n, 0);
    assert.equal((await db.query("select id from automation_flows")).rows[0].id, other.id);
  } finally { await db.close(); }
});

test("clear history covers all rows, preserves active runs, execution deduplication and other tenants", async () => {
  const { db, load, flow, runtime } = await automationFixture();
  try {
    const own = await flow(definition), other = await flow(definition, B);
    await runtime.enqueueAutomationRun(own, P, "done", {});
    await runtime.enqueueAutomationRun(own, P, "active", {});
    await runtime.enqueueAutomationRun(other, null, "other", {});
    await db.query("update automation_runs set status='completed' where event_key in ('done','other')");
    await db.query("insert into automation_legacy_archive(company_id,kind,source_id,snapshot) select $1,'task',gen_random_uuid(),'{}'::jsonb from generate_series(1,501)", [A]);
    await db.query("insert into automation_legacy_archive(company_id,kind,source_id,snapshot) values($1,'task',gen_random_uuid(),'{}')", [B]);
    const result = await load("src/lib/automations/actions.ts").clearAutomationHistory();
    assert.equal(result.count, 502);
    assert.equal((await db.query("select count(*)::int as n from automation_legacy_archive where company_id=$1", [A])).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from automation_legacy_archive where company_id=$1", [B])).rows[0].n, 1);
    const rows = (await db.query("select event_key,history_cleared_at from automation_runs")).rows;
    assert.ok(rows.find(r => r.event_key === "done").history_cleared_at);
    assert.equal(rows.find(r => r.event_key === "active").history_cleared_at, null);
    assert.equal(rows.find(r => r.event_key === "other").history_cleared_at, null);
    await runtime.enqueueAutomationRun(own, P, "done", {});
    assert.equal((await db.query("select count(*)::int as n from automation_runs where event_key='done'")).rows[0].n, 1);
    await db.query("insert into automation_templates(company_id,template_id,name,definition) values($1,'birthday','Outra igreja',$2)", [B, definition]);
    await db.exec(`set test.user_id='20000000-0000-4000-8000-000000000001'; set role authenticated;`);
    assert.equal((await db.query("select count(*)::int as n from automation_templates")).rows[0].n, 0);
    await assert.rejects(db.query("delete from automation_templates"), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
