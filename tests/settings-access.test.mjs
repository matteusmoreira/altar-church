import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"
import { test } from "node:test"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"

const require = createRequire(import.meta.url)
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
function load(path, bindings = {}) {
  const js = ts.transpileModule(source(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = { exports: {} }
  new Function("require", "module", "exports", js)((name) => bindings[name] ?? require(name), loaded, loaded.exports)
  return loaded.exports
}

const schema = load("src/lib/settings/access-schema.ts")
test("validates church roles, passwords, cell assignments and self protection", () => {
  const base = { name: "Maria", email: "  MARIA@example.test  ", role: "member", active: true, password: "password123" }
  assert.equal(schema.accessSchema.parse(base).email, "maria@example.test")
  for (const patch of [{ role: "superadmin" }, { password: "short" }, { role: "cell_leader", cellIds: [] }, { email: "invalid" }]) {
    assert.equal(schema.accessSchema.safeParse({ ...base, ...patch }).success, false)
  }
  assert.equal(schema.accessSchema.safeParse({ ...base, id: randomUUID(), password: "" }).success, true)
  const id = randomUUID()
  assert.throws(() => schema.assertAccessTarget(id, { id, role: "admin" }))
  assert.throws(() => schema.assertAccessTarget(id, { id, role: "admin" }, { role: "member", active: true }))
  assert.throws(() => schema.assertAccessTarget(id, { id: randomUUID(), role: "superadmin" }))
})

test("church access operations against isolated PostgreSQL with simulated Auth", async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create table companies (id uuid primary key, user_count integer default 0);
    create table public.profiles (id uuid primary key default gen_random_uuid(), company_id uuid,
      auth_user_id uuid unique, person_id uuid unique, name text, email text, role text, active boolean default true);
    create unique index profiles_company_email_active_unique on profiles(company_id, lower(email)) where active;
    create table public.people (id uuid primary key default gen_random_uuid(), company_id uuid, first_name text,
      full_name text, last_name text, email text, profile_id uuid, access_profile text, status text, person_type text, is_active boolean,
      created_by uuid, updated_by uuid, created_at timestamptz default now(), updated_at timestamptz, deleted_at timestamptz);
    create table public.groups (id uuid primary key, company_id uuid, type text, is_active boolean, deleted_at timestamptz,
      leader_person_id uuid, updated_at timestamptz);
    create table public.history (profile_id uuid references profiles(id), message text);
  `)
  await db.exec(source("supabase/migrations/20261005184836_church_access_crud.sql"))
  await db.exec(source("supabase/migrations/20260730220000_cell_leader_assignments.sql")
    .split("create or replace function public.sync_cell_leader_assignments(")[1]
    .split("revoke all on function")[0]
    .replace(/^/, "create or replace function public.sync_cell_leader_assignments("))
  await db.exec("create role anon; create role authenticated;")
  await db.exec(source("supabase/migrations/20261007174338_multiple_access_roles.sql").split("create or replace function public.sync_cell_group_leader_member()")[0])
  const church = randomUUID(), other = randomUUID(), actorId = randomUUID()
  await db.query("insert into companies(id) values ($1), ($2)", [church, other])
  await db.query("insert into profiles(id,company_id,name,email,role) values ($1,$2,'Admin','admin@example.test','admin')", [actorId, church])
  let actor = { id: actorId, churchId: church, role: "admin" }
  const identities = new Map()
  let failDelete = false, failInsert = false, failUpdate = false
  const calls = []
  const admin = {
    async createUser(input) {
      calls.push(["create", input.email])
      if ([...identities.values()].some((user) => user.email === input.email)) return { error: { message: "exists" }, data: {} }
      const id = randomUUID(); identities.set(id, { ...input, id }); return { data: { user: { id } }, error: null }
    },
    async updateUserById(id, input) { calls.push(["update", id]); if (failUpdate) return { error: { message: "Rejected" } }; Object.assign(identities.get(id), input); return { error: null } },
    async deleteUser(id) { calls.push(["delete", id]); if (failDelete) return { error: { code: "provider_failure" } }; identities.delete(id); return { error: null } },
  }
  const tag = (connection) => async (strings, ...params) => {
    const query = strings.reduce((value, part, i) => value + part + (i < params.length ? `$${i + 1}` : ""), "")
    if (failInsert && /insert into public.people/.test(query)) throw new Error("Simulated database failure")
    const serialized = params.map((value) => Array.isArray(value) ? `{${value.join(",")}}` : value)
    return (await connection.query(query, serialized)).rows
  }
  const sql = tag(db)
  sql.begin = (callback) => db.transaction((tx) => callback(tag(tx)))
  const audit = []
  const actions = load("src/lib/settings/access-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/auth/server": { getCurrentUser: async () => actor },
    "@/lib/auth/permissions": { requirePermission: async () => actor, writeAuditLog: async (input) => audit.push(input) },
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => ({ auth: { admin } }) },
    "./access-schema": schema,
    "@/lib/types": load("src/lib/types.ts"),
  })
  const input = { name: "Maria Silva", email: "maria@example.test", role: "member", active: true, password: "password123" }
  let profile
  await t.test("creates usable Auth login, profile, person and count", async () => {
    assert.deepEqual(await actions.saveChurchAccess(input), { ok: true })
    profile = (await db.query("select * from profiles where email=$1", [input.email])).rows[0]
    assert.equal(profile.company_id, church)
    assert.ok(profile.person_id)
    assert.equal(identities.get(profile.auth_user_id).password, input.password)
    assert.equal((await db.query("select user_count from companies where id=$1", [church])).rows[0].user_count, 2)
    assert.equal(JSON.stringify(audit).includes(input.password), false)
  })
  await t.test("rejects unauthorized roles, foreign profiles and existing Auth without adoption", async () => {
    const previousCalls = calls.length
    actor = { ...actor, role: "member" }
    assert.equal((await actions.saveChurchAccess(input)).ok, false)
    actor = { ...actor, role: "admin" }
    assert.equal((await actions.saveChurchAccess({ ...input, role: "superadmin" })).ok, false)
    assert.equal((await actions.saveChurchAccess({ ...input, id: randomUUID() })).ok, false)
    const foreignId = randomUUID()
    await db.query("insert into profiles(id,company_id,name,email,role) values ($1,$2,'Foreign','foreign@example.test','admin')", [foreignId, other])
    assert.equal((await actions.deleteChurchAccess(foreignId)).ok, false)
    assert.equal(calls.length, previousCalls)
    identities.set(randomUUID(), { email: "taken@example.test", password: "unchanged" })
    assert.equal((await actions.saveChurchAccess({ ...input, email: "taken@example.test" })).ok, false)
    assert.equal([...identities.values()].find((user) => user.email === "taken@example.test").password, "unchanged")
  })
  await t.test("updates the bound login, changes password and disables/enables", async () => {
    const edit = { ...input, id: profile.id, name: "Maria Souza", email: "maria.souza@example.test", password: "newpassword123", role: "finance", active: false }
    assert.deepEqual(await actions.saveChurchAccess(edit), { ok: true })
    assert.equal(identities.get(profile.auth_user_id).email, edit.email)
    assert.equal(identities.get(profile.auth_user_id).password, edit.password)
    assert.notEqual(identities.get(profile.auth_user_id).ban_duration, "none")
    assert.deepEqual(await actions.saveChurchAccess({ ...edit, password: "", active: true }), { ok: true })
    assert.equal(identities.get(profile.auth_user_id).ban_duration, "none")
    assert.equal((await db.query("select role from profiles where id=$1", [profile.id])).rows[0].role, "finance")
  })
  await t.test("protects own admin, rechecks revoked actor and rejects foreign cells", async () => {
    assert.equal((await actions.deleteChurchAccess(actorId)).ok, false)
    assert.equal((await actions.saveChurchAccess({ ...input, id: actorId, active: false })).ok, false)
    assert.equal((await actions.saveChurchAccess({ ...input, id: profile.id, role: "cell_leader", cellIds: [randomUUID()] })).ok, false)
    await db.query("update profiles set active=false where id=$1", [actorId])
    assert.equal((await actions.deleteChurchAccess(profile.id)).ok, false)
    await db.query("update profiles set active=true where id=$1", [actorId])
  })
  await t.test("assigns real cell leadership and removes it when changing role", async () => {
    const cell = randomUUID()
    await db.query("insert into groups(id,company_id,type,is_active) values ($1,$2,'cell',true)", [cell, church])
    const edit = { ...input, id: profile.id, email: "maria.souza@example.test", role: "cell_leader", cellIds: [cell], password: "" }
    assert.deepEqual(await actions.saveChurchAccess(edit), { ok: true })
    assert.equal((await db.query("select leader_person_id from groups where id=$1", [cell])).rows[0].leader_person_id, profile.person_id)
    assert.deepEqual(await actions.saveChurchAccess({ ...edit, role: "member", cellIds: [] }), { ok: true })
    assert.equal((await db.query("select leader_person_id from groups where id=$1", [cell])).rows[0].leader_person_id, null)
  })
  await t.test("combines profiles and removes only the deselected profile", async () => {
    const cell = randomUUID()
    await db.query("insert into groups(id,company_id,type,is_active) values ($1,$2,'cell',true)", [cell, church])
    const edit = { ...input, id: profile.id, email: "maria.souza@example.test", password: "", roles: ["ministry_leader", "cell_leader"], cellIds: [cell] }
    assert.deepEqual(await actions.saveChurchAccess(edit), { ok: true })
    let saved = (await db.query("select role,roles from profiles where id=$1", [profile.id])).rows[0]
    assert.deepEqual(saved.roles, ["cell_leader", "ministry_leader"])
    const permissions = load("src/lib/types.ts")
    assert.equal(permissions.hasPermission(saved, "cells.leader.manage"), true)
    assert.equal(permissions.hasPermission(saved, "ministries.members.manage"), true)
    assert.equal(permissions.hasPermission(saved, "finance.view"), false)
    assert.deepEqual(await actions.saveChurchAccess({ ...edit, roles: ["ministry_leader"], cellIds: [] }), { ok: true })
    saved = (await db.query("select roles from profiles where id=$1", [profile.id])).rows[0]
    assert.deepEqual(saved.roles, ["ministry_leader"])
    assert.equal((await db.query("select leader_person_id from groups where id=$1", [cell])).rows[0].leader_person_id, null)
    assert.equal((await actions.saveChurchAccess({ ...edit, roles: [] })).ok, false)
    assert.equal((await actions.saveChurchAccess({ ...edit, roles: ["member", "superadmin"] })).ok, false)
    assert.equal((await actions.saveChurchAccess({ ...edit, id: actorId, email: "admin@example.test", roles: ["admin", "finance"] })).ok, false)
  })
  await t.test("Auth update rejection rolls back profile and person edits", async () => {
    const before = (await db.query("select name,email from profiles where id=$1", [profile.id])).rows[0]
    failUpdate = true
    assert.equal((await actions.saveChurchAccess({ ...input, id: profile.id, email: "rejected@example.test", name: "Rejected change" })).ok, false)
    failUpdate = false
    assert.deepEqual((await db.query("select name,email from profiles where id=$1", [profile.id])).rows[0], before)
    assert.equal(identities.get(profile.auth_user_id).email, before.email)
  })
  await t.test("compensates new Auth identity when the database rejects provisioning", async () => {
    const size = identities.size
    failInsert = true
    assert.equal((await actions.saveChurchAccess({ ...input, email: "failure@example.test" })).ok, false)
    failInsert = false
    assert.equal(identities.size, size)
    assert.equal((await db.query("select id from profiles where email='failure@example.test'")).rows.length, 0)
  })
  await t.test("deletion failure keeps access blocked, retry preserves history and person", async () => {
    await db.query("insert into history values ($1,'Preserved message')", [profile.id])
    failDelete = true
    assert.equal((await actions.deleteChurchAccess(profile.id)).ok, false)
    const blocked = (await db.query("select * from profiles where id=$1", [profile.id])).rows[0]
    assert.equal(blocked.active, false); assert.equal(blocked.deleted_at, null)
    failDelete = false
    assert.deepEqual(await actions.deleteChurchAccess(profile.id), { ok: true })
    const removed = (await db.query("select * from profiles where id=$1", [profile.id])).rows[0]
    assert.ok(removed.deleted_at); assert.equal(removed.auth_user_id, null)
    assert.equal(identities.has(profile.auth_user_id), false)
    assert.equal((await db.query("select * from history")).rows.length, 1)
    assert.equal((await db.query("select profile_id from people where id=$1", [profile.person_id])).rows[0].profile_id, null)
    assert.equal((await db.query("select user_count from companies where id=$1", [church])).rows[0].user_count, 1)
    assert.deepEqual(await actions.saveChurchAccess({ ...input, email: "maria.souza@example.test" }), { ok: true })
    assert.equal((await db.query("select person_id from profiles where email='maria.souza@example.test' and deleted_at is null")).rows[0].person_id, profile.person_id)
  })
})
