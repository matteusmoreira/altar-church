import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automationFixture, A, B, I } from "./helpers/automation-fixture.mjs";

test("scheduler avoids empty invocations but wakes for durable work, schedules and expired leases", async t => {
  const f = await automationFixture({}, { queue: true });
  t.after(() => f.db.close());
  await f.db.exec(readFileSync("supabase/migrations/20261008174420_vercel_idle_automation_worker.sql", "utf8"));
  await f.db.exec(`create table net.calls(id int generated always as identity);
    create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
    returns bigint language plpgsql as $$begin insert into net.calls default values; return 1; end$$;
    insert into vault.decrypted_secrets values ('automation_worker_url','https://worker.test'),('automation_worker_secret','fixture');`);
  const hasWork = async () => (await f.db.query("select automation_worker_has_work() as value")).rows[0].value;
  const invoke = async () => (await f.db.query("select invoke_automation_worker() as value")).rows[0].value;
  assert.equal(await hasWork(), false);
  assert.equal(await invoke(), null);
  const definition = { schemaVersion: 1, nodes: [f.newNode("trigger", "start"), f.newNode("end", "end")], edges: [{ id: "a", source: "start", target: "end", port: "next" }] };
  definition.nodes[0].config = { mode: "event", event: "person.created" };
  const flow = await f.flow(definition);
  assert.equal(await hasWork(), false, "idle event flows do not poll Vercel");
  await f.db.query("insert into automation_events(company_id,type,source_key) values($1,'person.created','other')", [B]);
  assert.equal(await hasWork(), false, "other churches cannot wake this flow");
  await f.db.query("insert into automation_events(company_id,type,source_key) values($1,'person.created','matching')", [A]);
  assert.equal(await invoke(), 1);
  await f.db.exec("update automation_events set processed_at=now(); update automation_flows set status='draft'");
  assert.equal(await hasWork(), false);
  await f.db.query("insert into automation_inbox(company_id,instance_id,event_key,chat_id,due_at) values($1,$2,'inbox','fixture',now()+interval '1 hour')", [A,I]);
  assert.equal(await hasWork(), false, "future retries stay asleep");
  await f.db.exec("update automation_inbox set due_at=now()");
  assert.equal(await hasWork(), true);
  await f.db.exec("update automation_inbox set status='working',lease_until=now()+interval '1 hour'");
  assert.equal(await hasWork(), false, "another worker owns the lease");
  await f.db.exec("update automation_inbox set lease_until=now()-interval '1 minute'");
  assert.equal(await hasWork(), true, "expired leases are recovered");
  await f.db.exec("update automation_inbox set status='processed'");
  await f.db.query("insert into automation_runs(company_id,flow_id,version_id,event_key,node_id) values($1,$2,$3,'run','start')", [A,flow.id,flow.published_version_id]);
  assert.equal(await hasWork(), false, "draft flows cannot resume");
  await f.db.exec("update automation_flows set status='active'");
  assert.equal(await hasWork(), true);
  await f.db.exec("update automation_runs set status='working',lease_until=now()+interval '1 hour'");
  assert.equal(await hasWork(), false);
  await f.db.exec("update automation_runs set lease_until=now()-interval '1 minute'");
  assert.equal(await hasWork(), true);
  await f.db.exec(`update automation_runs set status='waiting',wait_kind='task',due_at=now()+interval '1 year';
    insert into automation_tasks(company_id,run_id,node_id,title) select company_id,id,'task','Fixture' from automation_runs;
    update automation_runs r set context=jsonb_build_object('task_id',t.id) from automation_tasks t where t.run_id=r.id;`);
  assert.equal(await hasWork(), false, "an open human task does not poll Vercel");
  await f.db.exec("update automation_tasks set status='completed'");
  assert.equal(await hasWork(), true, "completed tasks resume even with a future timeout");
  await f.db.exec("update automation_runs set status='completed'");
  for (const config of [{mode:'schedule',schedule:'daily',time:'09:00'}, {mode:'birthday'}, {mode:'relative_date'}, {mode:'event',event:'event.upcoming'}, {mode:'event',event:'volunteer.upcoming'}]) {
    definition.nodes[0].config = config;
    await f.db.query("update automation_versions set definition=$1 where id=$2", [definition,flow.published_version_id]);
    assert.equal(await hasWork(), true, `${config.mode}/${config.event ?? ''} retains its clock trigger`);
  }
  assert.equal((await f.db.query("select count(*)::int n from net.calls")).rows[0].n, 1, "only the explicit nonempty invocation made HTTP");
  const grants = (await f.db.query(`select has_function_privilege('anon','automation_worker_has_work()','execute') as anon,
    has_function_privilege('authenticated','invoke_automation_worker()','execute') as authenticated,
    has_function_privilege('service_role','automation_worker_has_work()','execute') as service`)).rows[0];
  assert.deepEqual(grants, { anon: false, authenticated: false, service: true });
});
