import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("panel-only migration stops pending scale deliveries and automatic reminders", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role service_role; create role anon; create role authenticated;
      create table volunteer_delivery_outbox (
        id int primary key, event_kind text, status text, locked_at timestamptz,
        last_error text, updated_at timestamptz
      );
      insert into volunteer_delivery_outbox(id,event_kind,status) values
        (1,'schedule','pending'), (2,'reminder','failed'), (3,'schedule','processing'),
        (4,'schedule','queued'), (5,'schedule','delivered'), (6,'chat','pending'),
        (7,'feed','pending');`);
    await db.exec(await readFile("supabase/migrations/20261006105110_volunteer_panel_only_schedules.sql", "utf8"));
    await db.exec("grant execute on function prepare_volunteer_delivery() to anon, authenticated");
    await db.exec(await readFile("supabase/migrations/20261006110931_volunteer_delivery_service_only.sql", "utf8"));
    assert.deepEqual((await db.query(`select
      has_function_privilege('anon','prepare_volunteer_delivery()','EXECUTE') as anon,
      has_function_privilege('authenticated','prepare_volunteer_delivery()','EXECUTE') as authenticated,
      has_function_privilege('service_role','prepare_volunteer_delivery()','EXECUTE') as service_role`)).rows[0],
    { anon: false, authenticated: false, service_role: true });
    assert.deepEqual((await db.query("select id,status from volunteer_delivery_outbox order by id")).rows, [
      { id: 1, status: "skipped" }, { id: 2, status: "skipped" },
      { id: 3, status: "skipped" }, { id: 4, status: "skipped" },
      { id: 5, status: "delivered" }, { id: 6, status: "pending" }, { id: 7, status: "pending" },
    ]);
    assert.deepEqual((await db.query("select prepare_volunteer_delivery() as result")).rows[0].result, { reminders: 0, noShows: 0 });
  } finally { await db.close(); }
});

test("member dashboard shows only their published upcoming scales in their church", async () => {
  const source = await readFile("src/lib/member/data.ts", "utf8");
  const query = source.match(/`\s*(select assignment\.id, coalesce\(event\.title[\s\S]*?)`/)[1]
    .replaceAll("${companyId}", "$1").replaceAll("${personId}", "$2");
  const db = new PGlite();
  try {
    await db.exec(`
      create table volunteer_assignments(id text, volunteer_id text, shift_id text, company_id text, status text);
      create table volunteer_profiles(id text, company_id text, person_id text, deleted_at timestamptz);
      create table volunteer_shifts(id text, event_id text, company_id text, department_id text, schedule_id text,
        role_name text, starts_at timestamptz, ends_at timestamptz, instructions text, created_at timestamptz default now());
      create table events(id text, company_id text, title text, deleted_at timestamptz, status text, volunteer_schedule_published_at timestamptz);
      create table volunteer_departments(id text, company_id text, name text, deleted_at timestamptz);
      create table volunteer_schedules(id text, company_id text, status text, published_at timestamptz);
      insert into volunteer_profiles values ('v1','a','p1',null),('v2','a','p2',null),('v3','b','p1',null);
      insert into volunteer_departments values ('d1','a','Recepção',null),('d2','b','Recepção',null);
      insert into volunteer_schedules(id,company_id,status,published_at) values ('s1','a','draft',null),('s2','b','published',now());`);
    for (const [id, company, volunteer, status, published, ended, eventStatus, deleted] of [
      ["own", "a", "v1", "confirmed", true, false, "published", false],
      ["other-person", "a", "v2", "confirmed", true, false, "published", false],
      ["other-church", "b", "v3", "confirmed", true, false, "published", false],
      ["draft", "a", "v1", "confirmed", false, false, "draft", false],
      ["proposed", "a", "v1", "proposed", true, false, "published", false],
      ["removed", "a", "v1", "cancelled", true, false, "published", false],
      ["ended", "a", "v1", "confirmed", true, true, "published", false],
      ["cancelled-event", "a", "v1", "confirmed", true, false, "cancelled", false],
      ["deleted-event", "a", "v1", "confirmed", true, false, "published", true],
    ]) {
      await db.query("insert into events values($1,$2,'Atividade',case when $3 then now() end,$4,case when $5 then now() end)", [id, company, deleted, eventStatus, published]);
      await db.query(`insert into volunteer_shifts values($1,$1,$2,$3,$4,'Limpeza',
        now() + case when $5 then interval '-2 days' else interval '1 day' end,
        now() + case when $5 then interval '-1 day' else interval '2 days' end,'Chegar 10 min antes')`,
      [id, company, company === "a" ? "d1" : "d2", company === "a" ? "s1" : "s2", ended]);
      await db.query("insert into volunteer_assignments values($1,$2,$1,$3,$4)", [id, volunteer, company, status]);
    }
    assert.deepEqual((await db.query(query, ["a", "p1"])).rows.map((row) => row.id), ["own"]);
    assert.deepEqual((await db.query(query, ["a", "p2"])).rows.map((row) => row.id), ["other-person"]);
    assert.deepEqual((await db.query(query, ["b", "p1"])).rows.map((row) => row.id), ["other-church"]);
    const notice = (await db.query(query, ["a", "p1"])).rows[0];
    assert.equal(notice.role_name, "Limpeza");
    assert.equal(notice.instructions, "Chegar 10 min antes");
    await db.exec(`insert into volunteer_shifts values ('standalone',null,'a','d1','s1','Recepção',now()+interval '1 day',null,'');
      insert into volunteer_assignments values ('standalone','v1','standalone','a','confirmed');
      update volunteer_schedules set status = 'published', published_at = now() where id = 's1';`);
    const monthlyNotices = (await db.query(query, ["a", "p1"])).rows;
    assert.ok(monthlyNotices.some((row) => row.id === "standalone" && row.event_title === "Escala"));
    assert.ok(!monthlyNotices.some((row) => row.id === "cancelled-event" || row.id === "deleted-event"));
  } finally { await db.close(); }
});

test("all scale publishers expose assignments without external deliveries or member setup", async () => {
  for (const [file, action, end] of [
    ["src/lib/ministries/actions.ts", "publishMinistryScale", "removeMinistryScale"],
    ["src/lib/volunteers/actions.ts", "publishVolunteerSchedule", "saveVolunteerFeedPost"],
    ["src/lib/volunteers/v2-actions.ts", "publishVolunteerEventSchedule", "const eventPlanSchema"],
  ]) {
    const source = await readFile(file, "utf8");
    const publication = source.split(`export async function ${action}(`)[1].split(end)[0];
    assert.doesNotMatch(publication, /volunteer_delivery_outbox|notification_preferences/);
    assert.match(publication, /set status = 'confirmed'/);
  }
  const ui = await readFile("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx", "utf8");
  const portal = ui.split("export function VolunteerPortalV2(")[1];
  assert.match(portal, /Você foi escalado:/);
  assert.doesNotMatch(portal, /<Input|<Button|Disponibilidade|Preferências de avisos|Confirmar presença/);
});
