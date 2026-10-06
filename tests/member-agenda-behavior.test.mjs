import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { randomUUID } from "node:crypto"
import test from "node:test"
import ts from "typescript"
import { PGlite } from "@electric-sql/pglite"

const require = createRequire(import.meta.url)
function load(path, bindings) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  new Function("require", "module", "exports", source)((name) => name in bindings ? bindings[name] : require(name), loadedModule, loadedModule.exports)
  return loadedModule.exports
}
const tag = (db) => async (strings, ...params) => {
  const query = strings.reduce((text, part, i) => text + part + (i < params.length ? `$${i + 1}` : ""), "")
  return (await db.query(query, params)).rows
}

test("agenda shows published roles and instructions, highlights own assignment and hides drafts", async (t) => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create table events(id uuid primary key,company_id uuid,ministry_id uuid,title text,description text,type text,
      starts_at timestamptz,ends_at timestamptz,location text,online_link text,max_capacity int,status text,
      deleted_at timestamptz,registration_enabled boolean,volunteer_schedule_published_at timestamptz);
    create table ministries(id uuid primary key,company_id uuid,name text,leader_person_id uuid,deleted_at timestamptz);
    create table ministry_memberships(company_id uuid,ministry_id uuid,person_id uuid,status text,role text,left_at timestamptz);
    create table member_event_rsvps(id uuid,company_id uuid,event_id uuid,person_id uuid,status text,updated_at timestamptz);
    create table people(id uuid,company_id uuid,full_name text,deleted_at timestamptz);
    create table volunteer_schedules(id uuid,company_id uuid,status text);
    create table volunteer_shifts(id uuid,company_id uuid,schedule_id uuid,event_id uuid,event_position_id uuid,role_name text,starts_at timestamptz,ends_at timestamptz);
    create table volunteer_event_positions(id uuid,company_id uuid,instructions text);
    create table volunteer_profiles(id uuid,company_id uuid,person_id uuid);
    create table volunteer_assignments(id uuid,company_id uuid,shift_id uuid,volunteer_id uuid,status text);
  `)
  const companyId = randomUUID(), personId = randomUUID(), eventId = randomUUID(), ministryId = randomUUID()
  const shift = randomUUID(), schedule = randomUUID(), position = randomUUID(), volunteer = randomUUID()
  await db.query("insert into ministries values($1,$2,'Tecnologia',$3,null)", [ministryId,companyId,personId])
  await db.query("insert into ministry_memberships values($1,$2,$3,'active','leader',null)", [companyId,ministryId,personId])
  await db.query("insert into events values($1,$2,$3,'Palestra','Descrição completa','meeting',now(),now()+interval '1 hour','Sala 1','',0,'published',null,true,null)", [eventId,companyId,ministryId])
  await db.query("insert into people values($1,$2,'Maria',null)", [personId,companyId])
  await db.query("insert into volunteer_schedules values($1,$2,'draft')", [schedule,companyId])
  await db.query("insert into volunteer_event_positions values($1,$2,'Chegar 30 minutos antes')", [position,companyId])
  await db.query("insert into volunteer_shifts values($1,$2,$3,$4,$5,'Projeção',now(),now()+interval '1 hour')", [shift,companyId,schedule,eventId,position])
  await db.query("insert into volunteer_profiles values($1,$2,$3)", [volunteer,companyId,personId])
  await db.query("insert into volunteer_assignments values($1,$2,$3,$4,'confirmed')", [randomUUID(),companyId,shift,volunteer])
  for (const status of ['canceled','going']) await db.query("insert into member_event_rsvps values($1,$2,$3,$4,$5,now())", [randomUUID(),companyId,eventId,personId,status])
  const data = load("src/lib/member/data.ts", {
    'server-only': {}, '@/lib/db/client': { getSql: () => tag(db) },
    './access': { requireMemberContext: async () => ({companyId,personId}) }, '@/lib/cells/rich-content': {},
  })
  let events = await data.listMemberAgenda()
  assert.equal(events.length, 1); assert.equal(events[0].myStatus, 'going'); assert.equal(events[0].goingCount, 1)
  assert.equal(events[0].maxCapacity, null); assert.deepEqual(events[0].scale, [])
  await db.query("update events set volunteer_schedule_published_at=now() where id=$1", [eventId])
  events = await data.listMemberAgenda()
  assert.equal(events[0].canManageMinistry, true)
  assert.deepEqual(events[0].scale.map(({role,personName,instructions,isMine}) => ({role,personName,instructions,isMine})),
    [{role:'Projeção',personName:'Maria',instructions:'Chegar 30 minutos antes',isMine:true}])
})

test("RSVP confirms, waits, cancels, promotes and reconfirms with canceled history", async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create table events(id uuid primary key, company_id uuid, ministry_id uuid, registration_enabled boolean,
      max_capacity int, status text, deleted_at timestamptz);
    create table ministry_memberships(company_id uuid, ministry_id uuid, person_id uuid, status text, left_at timestamptz);
    create table member_event_rsvps(id uuid primary key default gen_random_uuid(), company_id uuid, event_id uuid,
      person_id uuid, status text, created_at timestamptz default now(), updated_at timestamptz default now());
    create unique index active_rsvp on member_event_rsvps(event_id, person_id) where status <> 'canceled';
    create table event_guest_registrations(id uuid, company_id uuid, event_id uuid, status text, created_at timestamptz);
  `)
  const company = randomUUID(), otherCompany = randomUUID(), ministry = randomUUID(), event = randomUUID()
  const first = randomUUID(), second = randomUUID(), outsider = randomUUID()
  let personId = first, companyId = company
  await db.query("insert into events values($1,$2,$3,true,1,'published',null)", [event, company, ministry])
  for (const person of [first, second]) await db.query("insert into ministry_memberships values($1,$2,$3,'active',null)", [company, ministry, person])
  const sql = tag(db)
  sql.begin = (callback) => db.transaction((tx) => callback(tag(tx)))
  const actions = load("src/lib/member/portal-actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/db/client": { getSql: () => sql },
    "@/lib/auth/permissions": { writeAuditLog: async () => {} },
    "@/lib/auth/phone": {},
    "./access": { requireMemberContext: async () => ({ user: { id: randomUUID() }, companyId, personId }) },
  })
  const form = new FormData(); form.set("eventId", event)
  assert.equal((await actions.rsvpMemberEvent(form)).status, "going")
  assert.equal((await actions.rsvpMemberEvent(form)).status, "going", "double click must remain idempotent")
  personId = second
  assert.equal((await actions.rsvpMemberEvent(form)).status, "waitlisted")
  personId = first
  assert.equal((await actions.cancelMemberEventRsvp(form)).ok, true)
  assert.equal((await db.query("select status from member_event_rsvps where person_id=$1", [second])).rows[0].status, "going")
  assert.equal((await actions.rsvpMemberEvent(form)).status, "waitlisted")
  // Legacy history can contain both an old canceled row and a current active row.
  await db.query("insert into member_event_rsvps(company_id,event_id,person_id,status,updated_at) values($1,$2,$3,'canceled',now()+interval '1 day')", [company,event,first])
  assert.equal((await actions.rsvpMemberEvent(form)).ok, true, "must select active row before canceled history")
  assert.equal((await db.query("select count(*)::int as total from member_event_rsvps where person_id=$1 and status<>'canceled'", [first])).rows[0].total, 1)
  personId = outsider
  assert.equal((await actions.rsvpMemberEvent(form)).ok, false)
  personId = first; companyId = otherCompany
  assert.equal((await actions.rsvpMemberEvent(form)).ok, false)
  companyId = company
  await db.query("update events set max_capacity=0 where id=$1", [event])
  assert.equal((await actions.rsvpMemberEvent(form)).status, "going", "zero means unlimited capacity")
})

test("ministry managers use scoped permissions without granting access to other ministries", async () => {
  const companyId = randomUUID(), ministryId = randomUUID(), personId = randomUUID()
  let membership = "leader", permissionCalls = 0
  const access = load("src/lib/ministries/access.ts", {
    "@/lib/auth/server": {
      getCurrentUser: async () => ({ id: randomUUID(), role: "member", churchId: companyId }),
      requireUserCompanyId: () => companyId,
    },
    "@/lib/db/client": { getSql: () => async (strings) => {
      const query = strings.join("")
      if (query.includes("from public.ministries")) return [{ id: ministryId, slug: "test" }]
      if (query.includes("from public.profiles")) return [{ person_id: personId }]
      return membership ? [{ role: membership }] : []
    } },
    "@/lib/auth/permissions": { requirePermission: async () => { permissionCalls++; throw new Error("Acesso negado") } },
  })
  assert.equal((await access.requireMinistryPermission(ministryId, "ministries.agenda.manage", companyId, { manage: true })).canManage, true)
  assert.equal(permissionCalls, 0)
  membership = "coordinator"
  assert.equal((await access.requireMinistryPermission(ministryId, "ministries.dashboard.view", companyId, { manage: true })).canManage, true)
  await assert.rejects(access.requireMinistryPermission(ministryId, "members.edit", companyId), /Acesso negado/)
  membership = "member"
  await assert.rejects(access.requireMinistryPermission(ministryId, "ministries.agenda.manage", companyId, { manage: true }), /Acesso negado/)
  membership = null
  await assert.rejects(access.requireMinistryPermission(ministryId, "ministries.dashboard.view", companyId, { manage: true }), /não pertence/)
})
