import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("ministry assignment creates and reuses profiles with the active partial index", async () => {
  const source = await readFile("src/lib/ministries/actions.ts", "utf8");
  const body = source.split("async function ensureMinistryVolunteerProfile(")[1].split("async function ensureMinistryVolunteerMembership(")[0];
  const query = body.match(/`([\s\S]*?)`/)[1]
    .replaceAll("${companyId}", "$1")
    .replaceAll("${personId}", "$2")
    .replaceAll("${actorId}", "$3");
  const db = new PGlite();
  try {
    await db.exec(`create table volunteer_profiles (
      id serial primary key, company_id text, person_id text, registration_status text,
      whatsapp_enabled boolean, email_enabled boolean, created_by text, updated_by text,
      deleted_at timestamptz, updated_at timestamptz
    );
    create unique index volunteer_profiles_person_active_unique
      on volunteer_profiles(person_id) where deleted_at is null;`);
    const values = ["church-a", "person-a", "leader-a"];
    await assert.rejects(db.query(query.replace("where deleted_at is null do update", "do update"), values), /no unique or exclusion constraint/);
    const first = (await db.query(query, values)).rows[0].id;
    assert.equal((await db.query(query, values)).rows[0].id, first);
    assert.equal((await db.query(query, ["church-b", "person-a", "leader-b"])).rows.length, 0);
    await db.query("update volunteer_profiles set deleted_at = now() where id = $1", [first]);
    const recreated = (await db.query(query, values)).rows[0].id;
    assert.notEqual(recreated, first);
    assert.equal((await db.query("select count(*)::int n from volunteer_profiles where deleted_at is null")).rows[0].n, 1);
  } finally {
    await db.close();
  }
});
