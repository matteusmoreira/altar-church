import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const A = "10000000-0000-4000-8000-000000000001",
  B = "10000000-0000-4000-8000-000000000002",
  USER = "20000000-0000-4000-8000-000000000001",
  PERSON = "30000000-0000-4000-8000-000000000001";
test("isolated PostgreSQL: migration, transactional events, archive, leases, budgets and tenant RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create schema vault;create schema net;create schema extensions;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user_id',true),'')::uuid$$;
  create function public.is_superadmin() returns boolean language sql stable as $$select false$$;
  create table vault.decrypted_secrets(name text,decrypted_secret text);
  create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
  grant usage on schema public,auth to authenticated;`);
    await db.exec(
      await readFile(
        new URL("./fixtures/automation-base-schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.query(
      "insert into companies(id,name,status,active) values($1,'Igreja teste','test',true),($2,'Outra igreja','test',true)",
      [A, B],
    );
    await db.query(
      "insert into profiles(id,auth_user_id,company_id,role,active,name) values($1,$1,$2,'admin',true,'Admin')",
      [USER, A],
    );
    await db.query(
      "insert into people(id,company_id,full_name,person_type,is_active,status) values($1,$2,'Ana','member',true,'active')",
      [PERSON, A],
    );
    await db.query(
      "insert into person_follow_up_tasks(company_id,person_id,title,status) values($1,$2,'Tarefa anterior','open')",
      [A, PERSON],
    );
    await db.query(
      "insert into person_follow_up_triggers(company_id,is_active) values($1,true)",
      [A],
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261005140000_automations.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from automation_legacy_archive where kind='task'",
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select is_active from person_follow_up_triggers"))
        .rows[0].is_active,
      false,
    );
    assert.equal(
      (await db.query("select baptism_date from people where id=$1", [PERSON]))
        .rows[0].baptism_date,
      null,
    );
    await db.query("update people set baptism_date='2026-10-05' where id=$1", [
      PERSON,
    ]);
    assert.equal(
      (
        await db.query(
          "select type from automation_events order by created_at desc limit 1",
        )
      ).rows[0].type,
      "person.baptized",
    );
    const eventCount = (
      await db.query("select count(*)::int n from automation_events")
    ).rows[0].n;
    await db.exec("begin");
    await db.query("update people set status='inactive' where id=$1", [PERSON]);
    await db.exec("rollback");
    assert.equal(
      (await db.query("select count(*)::int n from automation_events")).rows[0]
        .n,
      eventCount,
    );
    // Exercise actual writes in each source module, not synthetic event insertion.
    async function transition(query, params, type) {
      const before = (
        await db.query(
          "select count(*)::int n from automation_events where type=$1",
          [type],
        )
      ).rows[0].n;
      const result = await db.query(query, params);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from automation_events where type=$1",
            [type],
          )
        ).rows[0].n,
        before + 1,
        type,
      );
      return result.rows[0]?.id;
    }
    await assert.rejects(
      db.query("update person_follow_up_triggers set is_active=true"),
      /arquivado/,
    );
    const group = (
      await db.query(
        "insert into groups(company_id,name,type,is_active) values($1,'Célula','cell',true) returning id",
        [A],
      )
    ).rows[0].id;
    const membership = await transition(
      "insert into group_members(company_id,group_id,person_id,status) values($1,$2,$3,'active') returning id",
      [A, group, PERSON],
      "cell.joined",
    );
    await transition(
      "update group_members set status='inactive' where id=$1",
      [membership],
      "cell.left",
    );
    await transition(
      "insert into cell_visit_requests(company_id,group_id,person_id) values($1,$2,$3)",
      [A, group, PERSON],
      "cell.visit_requested",
    );
    const ministry = await transition(
      "insert into ministry_memberships(company_id,person_id,status) values($1,$2,'active') returning id",
      [A, PERSON],
      "ministry.joined",
    );
    await transition(
      "update ministry_memberships set status='inactive' where id=$1",
      [ministry],
      "ministry.left",
    );
    const event = (
      await db.query(
        "insert into events(company_id,title) values($1,'Culto') returning id",
        [A],
      )
    ).rows[0].id;
    await transition(
      "insert into member_event_rsvps(company_id,event_id,person_id,status) values($1,$2,$3,'going')",
      [A, event, PERSON],
      "event.registered",
    );
    await transition(
      "insert into attendance_records(company_id,person_id,event_type,event_ref_id,status) values($1,$2,'event',$3,'present')",
      [A, PERSON, event],
      "event.present",
    );
    await transition(
      "insert into attendance_records(company_id,person_id,event_type,event_ref_id,status) values($1,$2,'event',$3,'absent')",
      [A, PERSON, event],
      "event.absent",
    );
    const volunteer = (
      await db.query(
        "insert into volunteer_profiles(company_id,person_id) values($1,$2) returning id",
        [A, PERSON],
      )
    ).rows[0].id;
    const assignment = await transition(
      "insert into volunteer_assignments(company_id,volunteer_id,status) values($1,$2,'assigned') returning id",
      [A, volunteer],
      "volunteer.assigned",
    );
    await transition(
      "update volunteer_assignments set status='confirmed' where id=$1",
      [assignment],
      "volunteer.confirmed",
    );
    await transition(
      "update volunteer_assignments set status='declined' where id=$1",
      [assignment],
      "volunteer.declined",
    );
    const plan = (
      await db.query(
        "insert into reading_plans(company_id,name,status) values($1,'Discipulado','published') returning id",
        [A],
      )
    ).rows[0].id;
    const step = (
      await db.query(
        "insert into reading_plan_steps(company_id,plan_id,title) values($1,$2,'Etapa') returning id",
        [A, plan],
      )
    ).rows[0].id;
    const enrollment = await transition(
      "insert into reading_plan_enrollments(company_id,person_id,plan_id) values($1,$2,$3) returning id",
      [A, PERSON, plan],
      "discipleship.enrolled",
    );
    await transition(
      "insert into reading_plan_person_progress(company_id,enrollment_id,person_id,step_id) values($1,$2,$3,$4)",
      [A, enrollment, PERSON, step],
      "discipleship.progress",
    );
    await transition(
      "update reading_plan_enrollments set status='completed' where id=$1",
      [enrollment],
      "discipleship.completed",
    );
    await transition(
      "insert into form_submissions(company_id,person_id) values($1,$2)",
      [A, PERSON],
      "form.submitted",
    );
    const card = await transition(
      "insert into crm_cards(company_id,person_id) values($1,$2) returning id",
      [A, PERSON],
      "crm.created",
    );
    await transition(
      "update crm_cards set updated_at=now() where id=$1",
      [card],
      "crm.updated",
    );
    const prayer = await transition(
      "insert into prayer_requests(company_id,status) values($1,'pending') returning id",
      [A],
      "prayer.created",
    );
    await transition(
      "update prayer_requests set status='answered' where id=$1",
      [prayer],
      "prayer.updated",
    );
    const kid = await transition(
      "insert into kid_attendances(company_id) values($1) returning id",
      [A],
      "kids.checkin",
    );
    await transition(
      "update kid_attendances set checked_out_at=now() where id=$1",
      [kid],
      "kids.checkout",
    );
    await transition(
      "insert into kid_access_events(company_id,event_type) values($1,'guardian_called')",
      [A],
      "kids.guardian_called",
    );
    await transition(
      "insert into content_posts(company_id,status) values($1,'published')",
      [A],
      "content.published",
    );
    await transition(
      "insert into congregations(company_id,name) values($1,'Sede')",
      [A],
      "congregation.updated",
    );
    await transition(
      "insert into revenues(company_id) values($1)",
      [A],
      "finance.updated",
    );
    const captured = (
      await db.query(
        "select context from automation_events where type in ('finance.updated','kids.checkin','prayer.created')",
      )
    ).rows;
    assert.ok(
      captured.every(
        (r) =>
          !("amount" in r.context) &&
          !("notes" in r.context) &&
          !("metadata" in r.context),
      ),
    );
    const afterTransitions = (
      await db.query("select count(*)::int n from automation_events")
    ).rows[0].n;
    await db.exec(
      "begin;select set_config('app.automation_run_id','test',true)",
    );
    await db.query("update people set city='Cidade' where id=$1", [PERSON]);
    await db.exec("commit");
    assert.equal(
      (await db.query("select count(*)::int n from automation_events")).rows[0]
        .n,
      afterTransitions,
    );
    const flow = (
      await db.query(
        "insert into automation_flows(company_id,name,draft,status) values($1,'Fluxo','{}','active') returning id",
        [A],
      )
    ).rows[0].id;
    const version = (
      await db.query(
        "insert into automation_versions(company_id,flow_id,number,definition) values($1,$2,1,'{}') returning id",
        [A, flow],
      )
    ).rows[0].id;
    const run = (
      await db.query(
        "insert into automation_runs(company_id,flow_id,version_id,person_id,event_key,node_id) values($1,$2,$3,$4,'event:1','start') returning id",
        [A, flow, version, PERSON],
      )
    ).rows[0].id;
    await assert.rejects(
      db.query(
        "insert into automation_runs(company_id,flow_id,version_id,event_key,node_id) values($1,$2,$3,'event:1','start')",
        [A, flow, version],
      ),
      /duplicate/,
    );
    const claim = (await db.query("select * from claim_automation_runs(25)"))
      .rows;
    assert.equal(claim.length, 1);
    assert.ok(claim[0].lease_token);
    assert.equal(
      (await db.query("select * from claim_automation_runs(25)")).rows.length,
      0,
    );
    await db.query(
      "update automation_runs set lease_until=now()-interval '1 minute' where id=$1",
      [run],
    );
    assert.equal(
      (await db.query("select * from claim_automation_runs(25)")).rows.length,
      1,
    );
    await db.query("update automation_flows set status='paused' where id=$1", [
      flow,
    ]);
    await db.query(
      "update automation_runs set lease_until=now()-interval '1 minute' where id=$1",
      [run],
    );
    assert.equal(
      (await db.query("select * from claim_automation_runs(25)")).rows.length,
      0,
    );
    await db.query(
      "update automation_settings set allowed_models=array['model/test'],monthly_budget_usd=1 where company_id=$1",
      [A],
    );
    await db.query(
      "select reserve_automation_ai($1,'call1','model/test',0.6)",
      [A],
    );
    await assert.rejects(
      db.query("select reserve_automation_ai($1,'call2','model/test',0.6)", [
        A,
      ]),
      /Orçamento/,
    );
    await assert.rejects(
      db.query(
        "select reserve_automation_ai($1,'call3','model/notallowed',0.1)",
        [A],
      ),
      /não habilitada/,
    );
    await assert.rejects(
      db.query("select reserve_automation_ai($1,'call1','model/test',0.1)", [
        A,
      ]),
      /já reservada/,
    );
    await db.query(
      "insert into automation_flows(company_id,name,draft) values($1,'Fluxo privado','{}')",
      [B],
    );
    await db.exec(
      `set role authenticated;select set_config('test.user_id','${USER}',false)`,
    );
    assert.equal(
      (await db.query("select distinct company_id from automation_flows")).rows
        .length,
      1,
    );
    assert.equal(
      (await db.query("select distinct company_id from automation_flows"))
        .rows[0].company_id,
      A,
    );
    await assert.rejects(
      db.query("update automation_flows set name='Ataque'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from automation_webhook_secrets"),
      /permission denied/,
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
