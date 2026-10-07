import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { PGlite } from "@electric-sql/pglite"

const migration = readFileSync(new URL("../supabase/migrations/20261007174338_multiple_access_roles.sql", import.meta.url), "utf8")
test("multiple roles migration preserves leadership and tenant boundaries", async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.auth_id', true),'')::uuid $$;
    create table profiles(id uuid primary key, company_id uuid, auth_user_id uuid, person_id uuid, role text, active boolean default true, deleted_at timestamptz, updated_at timestamptz);
    create table people(id uuid primary key, company_id uuid, profile_id uuid, access_profile text, person_type text, is_active boolean default true, deleted_at timestamptz, updated_at timestamptz);
    create table groups(id uuid primary key, company_id uuid, leader_person_id uuid, coordinator_person_id uuid, type text default 'cell', is_active boolean default true, deleted_at timestamptz, updated_by uuid);
    create table group_members(company_id uuid, group_id uuid, person_id uuid, role text, status text, left_at date, updated_at timestamptz, created_by uuid, updated_by uuid, unique(group_id,person_id));
    create table ministries(id uuid primary key, company_id uuid, leader_person_id uuid, deleted_at timestamptz);
    create table ministry_memberships(company_id uuid, ministry_id uuid, person_id uuid, role text, status text, joined_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, left_at timestamptz, updated_at timestamptz, unique(ministry_id,person_id));
    create table group_studies(id uuid primary key, company_id uuid, deleted_at timestamptz, is_active boolean, audience text);
    create table cell_study_targets(study_id uuid, group_id uuid);
    create function cell_current_person_id() returns uuid language sql as $$ select person_id from public.profiles where auth_user_id=auth.uid() and active and deleted_at is null $$;
    create function is_cell_participant(uuid) returns boolean language sql as $$ select false $$;
    create function ministry_current_person_id() returns uuid language sql as $$ select public.cell_current_person_id() $$;
    create function ministry_current_profile_id() returns uuid language sql as $$ select id from public.profiles where auth_user_id=auth.uid() and active and deleted_at is null $$;
  `)
  const church = randomUUID(), foreign = randomUUID(), profile = randomUUID(), person = randomUUID(), identity = randomUUID(), cell = randomUUID(), ministry = randomUUID(), foreignCell = randomUUID(), foreignMinistry = randomUUID()
  await db.query("insert into profiles(id,company_id,auth_user_id,person_id,role) values ($1,$2,$3,$4,'ministry_leader')", [profile, church, identity, person])
  await db.query("insert into people(id,company_id,profile_id,access_profile) values ($1,$2,$3,'ministry_leader')", [person, church, profile])
  await db.query("insert into groups(id,company_id,leader_person_id) values ($1,$2,$3),($4,$5,null)", [cell, church, person, foreignCell, foreign])
  await db.query("insert into ministries(id,company_id,leader_person_id) values ($1,$2,$3),($4,$5,null)", [ministry, church, person, foreignMinistry, foreign])
  await db.query("insert into ministry_memberships(company_id,ministry_id,person_id,role,status) values ($1,$2,$3,'leader','active')", [church,ministry,person])
  await db.exec(migration)
  await db.exec(`create trigger cell_sync after insert or update on groups for each row execute function sync_cell_group_leader_member();
    create trigger ministry_sync after insert or update on ministries for each row execute function sync_ministry_leader_role();`)
  const roles = async () => (await db.query("select roles from profiles where id=$1", [profile])).rows[0].roles
  assert.deepEqual(await roles(), ["cell_leader", "ministry_leader"])
  await db.query("select set_config('test.auth_id',$1,false)", [identity])
  let grants = (await db.query("select can_manage_cell($1) cell, can_manage_ministry($2) ministry, can_manage_cell($3) foreign_cell, can_manage_ministry($4) foreign_ministry", [cell,ministry,foreignCell,foreignMinistry])).rows[0]
  assert.deepEqual(grants, { cell:true, ministry:true, foreign_cell:false, foreign_ministry:false })
  // Removing ministry leadership preserves cell leadership.
  await db.query("update ministries set leader_person_id=null where id=$1", [ministry])
  assert.deepEqual(await roles(), ["cell_leader"])
  await db.query("update ministries set leader_person_id=$1 where id=$2", [person,ministry])
  assert.deepEqual(await roles(), ["cell_leader", "ministry_leader"])
  // Removing cell leadership preserves ministry leadership.
  await db.query("update groups set leader_person_id=null where id=$1", [cell])
  assert.deepEqual(await roles(), ["ministry_leader"])
  await db.query("update groups set leader_person_id=$1 where id=$2", [person,cell])
  assert.deepEqual(await roles(), ["cell_leader", "ministry_leader"])
  // Administrative and finance roles survive leadership synchronization too.
  await db.query("update profiles set roles=array['finance','ministry_leader','cell_leader','admin'] where id=$1", [profile])
  assert.deepEqual(await roles(), ["admin", "finance", "cell_leader", "ministry_leader"])
  assert.equal((await db.query("select can_manage_ministry($1) allowed", [foreignMinistry])).rows[0].allowed,false)
  await db.query("update groups set leader_person_id=null where id=$1", [cell])
  assert.deepEqual(await roles(), ["admin", "finance", "ministry_leader"])
  await db.query("update profiles set active=false where id=$1",[profile])
  assert.equal((await db.query("select can_manage_cell($1) allowed",[cell])).rows[0].allowed,false)
  assert.equal((await db.query("select can_manage_ministry($1) allowed",[ministry])).rows[0].allowed,false)
  await assert.rejects(db.query("update profiles set roles=array['superadmin','member'] where id=$1",[profile]),/profiles_roles_check/)
  await assert.rejects(db.query("update profiles set roles=array[]::text[] where id=$1",[profile]))
})
