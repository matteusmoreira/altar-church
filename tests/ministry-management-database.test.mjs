import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import ts from "typescript"

const inline = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
async function moduleUrl(file, imports = {}) {
  let source = ts.transpileModule(await readFile(new URL(`../src/lib/ministries/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [name,url] of Object.entries(imports)) source=source.replaceAll(`from "${name}"`,`from "${url}"`)
  return inline(source)
}
function adapter(db) {
  const sql = async (parts,...values) => (await db.query(parts.reduce((text,part,index)=>text+part+(index<values.length ? `$${index+1}` : ""),""),values.map(value=>value?.array ? `{${value.array.join(',')}}` : value instanceof Date ? value.toISOString() : value))).rows
  sql.array = array => ({array})
  sql.begin = async callback => {await db.exec("begin");try {const value=await callback(sql);await db.exec("commit");return value}catch(error){await db.exec("rollback");throw error}}
  return sql
}

test("ministry management: transactions, permissions, RLS, timezone and report periods", async () => {
  const db = new PGlite()
  const keys=["church","foreignChurch","ministry","otherMinistry","foreignMinistry","leader","coordinator","member","admin","outsider","inactive","source","target","occupied","foreignEvent","department","role","position","shift","schedule"]
  const ids=Object.fromEntries(keys.map(key=>[key,randomUUID()]))
  const sql=adapter(db)
  globalThis.__ministryManagement={sql,actor:{id:ids.leader,churchId:ids.church,role:"member",roles:["member"]},audits:[]}
  try {
    await db.exec(`
      create role authenticated;
      create table profiles(id uuid primary key,company_id uuid,person_id uuid,name text,role text,roles text[],active boolean default true,deleted_at timestamptz);
      create table people(id uuid primary key,company_id uuid,profile_id uuid,full_name text,is_active boolean default true,deleted_at timestamptz);
      create table ministries(id uuid primary key,company_id uuid,slug text,deleted_at timestamptz);
      create table church_profiles(company_id uuid,timezone text);
      create table ministry_memberships(id uuid default gen_random_uuid(),company_id uuid,ministry_id uuid,person_id uuid,role text,status text,left_at timestamptz,joined_at timestamptz default now()-interval '40 days',requested_at timestamptz default now());
      create table events(id uuid primary key,company_id uuid,ministry_id uuid,title text,starts_at timestamptz,ends_at timestamptz,status text default 'scheduled',deleted_at timestamptz,volunteer_schedule_published_at timestamptz);
      create table volunteer_departments(id uuid primary key,company_id uuid,ministry_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table volunteer_department_roles(id uuid primary key,company_id uuid,department_id uuid,is_active boolean default true,deleted_at timestamptz);
      create table volunteer_event_positions(id uuid primary key default gen_random_uuid(),company_id uuid,event_id uuid,department_id uuid,role_id uuid,role_name text,required_volunteers int,instructions text,sort_order int,created_by uuid,updated_by uuid,unique(event_id,department_id,role_id));
      create table volunteer_schedules(id uuid primary key default gen_random_uuid(),company_id uuid,month date,status text default 'draft',created_by uuid,updated_by uuid,unique(company_id,month));
      create table volunteer_shifts(id uuid primary key default gen_random_uuid(),company_id uuid,schedule_id uuid,event_id uuid,event_position_id uuid,department_id uuid,role_id uuid,role_name text,required_volunteers int,instructions text,starts_at timestamptz,ends_at timestamptz,checkin_opens_at timestamptz,checkin_closes_at timestamptz);
      create table volunteer_profiles(id uuid primary key default gen_random_uuid(),company_id uuid,person_id uuid,registration_status text default 'active',deleted_at timestamptz);
      create table volunteer_assignments(id uuid primary key default gen_random_uuid(),company_id uuid,shift_id uuid,volunteer_id uuid,status text,score int,score_reasons jsonb,is_locked boolean,created_by uuid,updated_by uuid);
      create table volunteer_department_memberships(company_id uuid,department_id uuid,volunteer_id uuid,role_name text,role_id uuid,preferred boolean,is_active boolean,unique(department_id,volunteer_id,role_name));
      create table person_follow_up_tasks(id uuid primary key default gen_random_uuid(),company_id uuid,ministry_id uuid,person_id uuid,title text,notes text,responsible_profile_id uuid,due_at timestamptz,priority text,status text,origin text,created_by uuid,updated_by uuid,completed_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now(),deleted_at timestamptz);
      create table attendance_records(id uuid primary key default gen_random_uuid(),company_id uuid,event_ref_id uuid,event_type text,person_id uuid,occurred_on date,status text,deleted_at timestamptz);
      create table groups(id uuid primary key,company_id uuid,ministry_id uuid,name text,type text,deleted_at timestamptz);
      create table group_members(group_id uuid,status text);
      create table notifications(company_id uuid,ministry_id uuid,status text,created_at timestamptz,deleted_at timestamptz);
      create function public.can_manage_ministry(id uuid) returns boolean language sql stable as $$select id::text=current_setting('test.managed_ministry',true)$$;
      alter table person_follow_up_tasks enable row level security;
      create policy existing_task_policy on person_follow_up_tasks for all to authenticated using(company_id::text=current_setting('test.church',true)) with check(company_id::text=current_setting('test.church',true));
      grant select,insert,update,delete on person_follow_up_tasks to authenticated;
    `)
    const migration=await readFile(new URL("../supabase/migrations/20261008210000_ministry_management_followups.sql",import.meta.url),"utf8")
    await db.exec(migration);await db.exec(migration)
    await db.query("insert into church_profiles values($1,'America/Sao_Paulo')",[ids.church])
    for (const [key,church] of [["ministry",ids.church],["otherMinistry",ids.church],["foreignMinistry",ids.foreignChurch]]) await db.query("insert into ministries values($1,$2,$3,null)",[ids[key],church,key])
    for(const key of ["leader","coordinator","member","admin","outsider","inactive"]) {
      const role=key==="admin" ? "admin" : "member"
      await db.query("insert into profiles(id,company_id,person_id,name,role,roles) values($1,$2,$1,$3,$4,array[$4])",[ids[key],ids.church,key,role])
      await db.query("insert into people(id,company_id,profile_id,full_name) values($1,$2,$1,$3)",[ids[key],ids.church,key])
      if(key!=="outsider" && key!=="admin") await db.query("insert into ministry_memberships(company_id,ministry_id,person_id,role,status) values($1,$2,$3,$4,$5)",[ids.church,ids.ministry,ids[key],["leader","coordinator"].includes(key)?key:"member",key==="inactive"?"inactive":"active"])
    }
    const sourceDate="2026-10-01T22:00:00Z",targetDate="2026-10-10T22:00:00Z"
    for(const key of ["source","target","occupied","foreignEvent"]) await db.query("insert into events(id,company_id,ministry_id,title,starts_at,ends_at) values($1,$2,$3,$4,$5,$5::timestamptz+interval '1 hour')",[ids[key],key==="foreignEvent"?ids.foreignChurch:ids.church,key==="foreignEvent"?ids.foreignMinistry:ids.ministry,key,key==="source"?sourceDate:targetDate])
    await db.query("insert into volunteer_departments(id,company_id,ministry_id) values($1,$2,$3)",[ids.department,ids.church,ids.ministry])
    await db.query("insert into volunteer_department_roles(id,company_id,department_id) values($1,$2,$3)",[ids.role,ids.church,ids.department])
    await db.query("insert into volunteer_event_positions(id,company_id,event_id,department_id,role_id,role_name,required_volunteers,instructions,sort_order) values($1,$2,$3,$4,$5,'Som',2,'Teste de som',0)",[ids.position,ids.church,ids.source,ids.department,ids.role])
    await db.query("insert into volunteer_shifts(id,company_id,event_id,event_position_id,role_name,starts_at,ends_at) values($1,$2,$3,$4,'Som',$5,$5::timestamptz+interval '1 hour')",[ids.shift,ids.church,ids.source,ids.position,sourceDate])
    for(const key of ["member","inactive"]) {const [v]=await db.query("insert into volunteer_profiles(company_id,person_id) values($1,$2) returning id",[ids.church,ids[key]]).then(r=>r.rows);await db.query("insert into volunteer_assignments(company_id,shift_id,volunteer_id,status) values($1,$2,$3,'confirmed')",[ids.church,ids.shift,v.id])}
    const stubs=inline(`export const getSql=()=>globalThis.__ministryManagement.sql;export const getCurrentUser=async()=>globalThis.__ministryManagement.actor;export const requireUserCompanyId=u=>u.churchId;export const requirePermission=async()=>{throw new Error('Acesso negado')};export const hasAnyRole=(u,roles)=>(u.roles??[u.role]).some(r=>roles.includes(r));export const revalidatePath=()=>{};export const writeAuditLog=async value=>globalThis.__ministryManagement.audits.push(value);export const createSignedUrlsByStoragePath=async()=>new Map();`)
    const contractUrl=await moduleUrl("management-contract.ts",{zod:import.meta.resolve("zod")})
    const accessUrl=await moduleUrl("access.ts",{"@/lib/db/client":stubs,"@/lib/auth/server":stubs,"@/lib/auth/permissions":stubs,"@/lib/types":stubs})
    const dataUrl=await moduleUrl("data.ts",{"@/lib/db/client":stubs,"@/lib/files/server":stubs,"./access":accessUrl,"./management-contract":contractUrl})
    const copyUrl=await moduleUrl("scale-copy.ts")
    const actions=await import(await moduleUrl("management-actions.ts",{zod:import.meta.resolve("zod"),"next/cache":stubs,"@/lib/db/client":stubs,"@/lib/auth/permissions":stubs,"./access":accessUrl,"./data":dataUrl,"./management-contract":contractUrl,"./scale-copy":copyUrl}))
    const contract=await import(contractUrl)
    assert.equal(contract.attendanceRate(0,0,0),null);assert.equal(contract.attendanceRate(2,1,1),50)
    assert.deepEqual(contract.reportPeriod(30,"America/Sao_Paulo",new Date("2026-10-09T01:00:00Z")),{from:"2026-09-09",to:"2026-10-08"})
    assert.throws(()=>contract.reportPeriodSchema.parse({from:"2026-10-09",to:"2026-10-08"}))
    const copied=await actions.copyMinistryScale({ministryId:ids.ministry,sourceEventId:ids.source,targetEventId:ids.target})
    assert.equal(copied.ok,true,copied.error);assert.equal(copied.data.copied,1);assert.equal(copied.data.omitted.length,1)
    const [targetShift]=await sql`select starts_at,ends_at from volunteer_shifts where event_id=${ids.target}`
    assert.equal(new Date(targetShift.starts_at).toISOString(),new Date(targetDate).toISOString())
    assert.equal(new Date(targetShift.ends_at).getTime()-new Date(targetShift.starts_at).getTime(),3600000)
    assert.equal((await sql`select volunteer_schedule_published_at from events where id=${ids.target}`)[0].volunteer_schedule_published_at,null)
    const again=await actions.copyMinistryScale({ministryId:ids.ministry,sourceEventId:ids.source,targetEventId:ids.target});assert.equal(again.ok,false)
    assert.equal((await actions.copyMinistryScale({ministryId:ids.ministry,sourceEventId:ids.source,targetEventId:ids.foreignEvent})).ok,false)
    // An insertion failure after copying positions must roll back all destination data.
    await db.exec("create function reject_copy() returns trigger language plpgsql as $$begin raise exception 'forced rollback';end$$;create trigger reject_copy before insert on volunteer_assignments for each row execute function reject_copy();")
    assert.equal((await actions.copyMinistryScale({ministryId:ids.ministry,sourceEventId:ids.source,targetEventId:ids.occupied})).ok,false)
    assert.equal((await sql`select id from volunteer_event_positions where event_id=${ids.occupied}`).length,0)
    await db.exec("drop trigger reject_copy on volunteer_assignments")
    const input={ministryId:ids.ministry,personId:ids.member,title:"Acompanhar integrante",notes:"Nota do ministério",nextAction:"Agendar conversa",responsibleProfileId:ids.leader,dueAt:"2026-10-07T21:00:00-03:00",priority:"high",status:"open"}
    const saved=await actions.saveMinistryFollowUp(input);assert.equal(saved.ok,true,saved.error)
    assert.equal((await actions.saveMinistryFollowUp({...input,responsibleProfileId:ids.member})).ok,false)
    assert.equal((await actions.saveMinistryFollowUp({...input,personId:ids.outsider})).ok,false)
    assert.equal((await actions.saveMinistryFollowUp({...input,id:saved.id,ministryId:ids.otherMinistry})).ok,false)
    for(const status of ["in_progress","completed","open","canceled"]) {assert.equal((await actions.saveMinistryFollowUp({...input,id:saved.id,status})).ok,true);const [task]=await sql`select completed_at,status from person_follow_up_tasks where id=${saved.id}`;assert.equal(Boolean(task.completed_at),status==="completed")}
    const management=await actions.loadMinistryManagement(ids.ministry);assert.equal(management.ok,true,management.error);assert.equal(management.data.followUps[0].nextAction,"Agendar conversa");assert.equal((await actions.saveMinistryFollowUp({...management.data.followUps[0],ministryId:ids.ministry,status:"in_progress"})).ok,true)
    assert.ok(management.data.responsibles.some(person=>person.id===ids.coordinator));assert.ok(!management.data.responsibles.some(person=>person.id===ids.member))
    for(const key of ["member","outsider"]) {globalThis.__ministryManagement.actor.id=ids[key];assert.equal((await actions.saveMinistryFollowUp(input)).ok,false);assert.equal((await actions.copyMinistryScale({ministryId:ids.ministry,sourceEventId:ids.source,targetEventId:ids.occupied})).ok,false)}
    for(const key of ["coordinator","admin"]) {globalThis.__ministryManagement.actor={id:ids[key],churchId:ids.church,role:key==="admin"?"admin":"member",roles:[key==="admin"?"admin":"member"]};assert.equal((await actions.saveMinistryFollowUp({...input,id:saved.id})).ok,true)}
    globalThis.__ministryManagement.actor={id:ids.leader,churchId:ids.church,role:"member",roles:["member"]}
    await db.query("insert into attendance_records(company_id,event_ref_id,event_type,person_id,occurred_on,status) values($1,$2,'ministry',$3,'2026-10-01','present'),($1,$2,'ministry',$3,'2026-09-01','absent')",[ids.church,ids.source,ids.member])
    const report=await actions.loadMinistryReport(ids.ministry,{from:"2026-10-01",to:"2026-10-01"});assert.equal(report.ok,true,report.error);assert.deepEqual(report.data.attendance,[{status:"present",total:1}]);assert.equal(report.data.volunteerHours,1);assert.equal(report.data.retention.currentActive,3)
    const history=await actions.loadMinistryPersonHistory(ids.ministry,ids.member);assert.equal(history.ok,true,history.error);assert.equal(history.data.attendance.length,2);assert.equal(history.data.assignments.length,2)
    // RLS restrictive policy blocks members even when another policy allows the church.
    await db.query("select set_config('test.church',$1,false),set_config('test.managed_ministry','',false)",[ids.church]);await db.exec("set role authenticated")
    assert.equal((await db.query("select * from person_follow_up_tasks")).rows.length,0)
    await assert.rejects(db.query("insert into person_follow_up_tasks(company_id,ministry_id) values($1,$2)",[ids.church,ids.ministry]),/row-level security/)
    await db.exec("reset role");await db.query("select set_config('test.managed_ministry',$1,false)",[ids.ministry]);await db.exec("set role authenticated")
    assert.equal((await db.query("select * from person_follow_up_tasks")).rows.length,1)
    await db.exec("reset role")
    assert.ok(globalThis.__ministryManagement.audits.some(audit=>audit.action==="ministry.scale.copy"))
  } finally {await db.close();delete globalThis.__ministryManagement}
})
