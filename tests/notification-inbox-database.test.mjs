import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { PGlite } from "@electric-sql/pglite"
import ts from "typescript"

const migration = new URL("../supabase/migrations/20261009112359_operational_notification_inbox.sql", import.meta.url)
const inline = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
async function loadModule(file, replacements) {
  let source = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/import "server-only";?/g, "")
  for (const [from,to] of Object.entries(replacements)) source=source.replaceAll(`from "${from}"`,`from "${to}"`)
  return inline(source)
}
function adapter(db) {
  const sql = async (parts,...values) => (await db.query(parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:""),""),values)).rows
  sql.begin=async callback=>{await db.exec("begin");try{const result=await callback(sql);await db.exec("commit");return result}catch(error){await db.exec("rollback");throw error}}
  return sql
}

test("personal inbox: transactional events, all modules, RLS, ownership, pagination and absence", async t => {
  const db = new PGlite()
  const id = Object.fromEntries(["church","foreignChurch","member","leader","otherLeader","admin","finance","communication","foreign","ministry","otherMinistry","department","shift","schedule","event","volunteer","assignment","cell","kid","session","conversation","subscription"].map(key=>[key,randomUUID()]))
  const sql = adapter(db)
  globalThis.__inboxTest={sql,actor:{id:id.member,role:"member",churchId:id.church},personId:id.member,refreshes:[]}
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth,private to authenticated;`)
    await db.exec(await readFile(new URL("./fixtures/notification-domain-schema.sql",import.meta.url),"utf8"))
    await db.exec("create table ministry_chat_push_outbox(id uuid primary key default gen_random_uuid(),message_id uuid,subscription_id uuid)")
    await db.exec("alter table volunteer_assignments add unique(shift_id,volunteer_id)")
    await db.query("insert into companies(id,name,active) values($1,'Test',true),($2,'Foreign',true)",[id.church,id.foreignChurch])
    for(const key of ["member","leader","otherLeader","admin","finance","communication","foreign"]){
      const roles=key==="admin"?["member","admin"]:key==="finance"?["member","finance"]:key==="communication"?["communication"]:["leader","otherLeader"].includes(key)?["ministry_leader","member"]:["member"]
      await db.query("insert into profiles(id,auth_user_id,company_id,person_id,name,role,roles,active) values($1,$1,$2,$1,$3,$4,$5,true)",[id[key],key==="foreign"?id.foreignChurch:id.church,key,roles[0],roles])
      await db.query("insert into people(id,profile_id,company_id,full_name,is_active,status) values($1,$1,$2,$3,true,'active')",[id[key],key==="foreign"?id.foreignChurch:id.church,key])
    }
    await db.query("insert into ministries(id,company_id,name,leader_person_id,is_active) values($1,$3,'Ministry',$4,true),($2,$3,'Other',$5,true)",[id.ministry,id.otherMinistry,id.church,id.leader,id.otherLeader])
    for(const key of ["member","leader"])await db.query("insert into ministry_memberships(company_id,ministry_id,person_id,role,status) values($1,$2,$3,$4,'active')",[id.church,id.ministry,id[key],key==="leader"?"leader":"member"])
    await db.query("insert into volunteer_departments(id,company_id,ministry_id,name,is_active) values($1,$2,$3,'Ministry',true)",[id.department,id.church,id.ministry])
    await db.query("insert into volunteer_schedules(id,company_id,status) values($1,$2,'published')",[id.schedule,id.church])
    await db.query("insert into events(id,company_id,ministry_id,title,description,starts_at,ends_at,status,volunteer_schedule_published_at,location) values($1,$2,$3,'Future','Instructions',now()+interval '2 days',now()+interval '2 days 2 hours','published',now(),'Church')",[id.event,id.church,id.ministry])
    await db.query("insert into volunteer_shifts(id,company_id,event_id,department_id,schedule_id,role_name,starts_at,ends_at) values($1,$2,$3,$4,$5,'Guitar',now()+interval '2 days',now()+interval '2 days 2 hours')",[id.shift,id.church,id.event,id.department,id.schedule])
    await db.query("insert into volunteer_profiles(id,company_id,person_id,registration_status) values($1,$2,$3,'active')",[id.volunteer,id.church,id.member])
    await db.query("insert into volunteer_assignments(id,company_id,shift_id,volunteer_id,status) values($1,$2,$3,$4,'confirmed')",[id.assignment,id.church,id.shift,id.volunteer])
    await db.query("insert into groups(id,company_id,type,name,leader_person_id,is_active) values($1,$2,'cell','Cell',$3,true)",[id.cell,id.church,id.leader])
    await db.query("insert into kid_settings(company_id,ministry_id) values($1,$2)",[id.church,id.ministry])
    await db.query("insert into kid_sessions(id,company_id,status,title) values($1,$2,'planned','Kids')",[id.session,id.church])
    await db.query("insert into kid_conversations(id,company_id,kid_id) values($1,$2,$3)",[id.conversation,id.church,id.kid])
    await db.query("insert into notification_push_subscriptions(id,company_id,profile_id,endpoint,p256dh,auth_key,is_active) values($1,$2,$3,'https://push.example.test/token','test-key','test-auth',true)",[id.subscription,id.church,id.leader])
    await db.exec(await readFile(migration,"utf8"))
    await db.exec(await readFile(new URL("../supabase/migrations/20261009120448_notification_subject_routes.sql",import.meta.url),"utf8"))
    await db.exec(await readFile(new URL("../supabase/migrations/20261009120849_notification_recipient_refinements.sql",import.meta.url),"utf8"))
    const stubs=inline(`export const getSql=()=>globalThis.__inboxTest.sql;
      export const getCurrentUser=async()=>globalThis.__inboxTest.actor;
      export const requireUserCompanyId=u=>u.churchId;
      export const resolveVolunteerContext=async()=>({user:globalThis.__inboxTest.actor,companyId:globalThis.__inboxTest.actor.churchId,personId:globalThis.__inboxTest.personId});
      export const resolveMinistryAccess=async identifier=>({user:globalThis.__inboxTest.actor,companyId:globalThis.__inboxTest.actor.churchId,personId:globalThis.__inboxTest.personId,ministryId:identifier,canManage:false});
      export const revalidatePath=p=>globalThis.__inboxTest.refreshes.push(p);
      export const toUserFriendlyError=(e)=>e.message;
      export const createSignedUrlsByStoragePath=async()=>new Map();`)
    const errors=await loadModule("../src/lib/api/errors.ts",{zod:import.meta.resolve("zod")})
    const contract=await loadModule("../src/lib/notifications/inbox-contract.ts",{zod:import.meta.resolve("zod")})
    const inbox=await import(await loadModule("../src/lib/notifications/inbox.ts",{"@/lib/auth/server":stubs,"@/lib/db/client":stubs,"@/lib/api/errors":errors,"./inbox-contract":contract}))
    const absence=await import(await loadModule("../src/lib/member/assignment-actions.ts",{zod:import.meta.resolve("zod"),"next/cache":stubs,"@/lib/db/client":stubs,"@/lib/volunteers/access":stubs,"@/lib/errors/user-friendly-error":stubs}))
    const details=await import(await loadModule("../src/lib/member/ministry-details.ts",{zod:import.meta.resolve("zod"),"@/lib/db/client":stubs,"@/lib/ministries/access":stubs,"@/lib/api/errors":errors,"@/lib/files/server":stubs}))
    const as=key=>{globalThis.__inboxTest.actor={id:id[key],role:"member",churchId:key==="foreign"?id.foreignChurch:id.church};globalThis.__inboxTest.personId=id[key]}
    const inboxFor=async(key,kind)=>{as(key);return (await inbox.listMyInbox({})).items.filter(item=>!kind||item.kind===kind)}
    await t.test("chat notifies only own leadership/admin, excludes author, persists without push subscription",async()=>{
      await db.query("insert into ministry_chat_messages(company_id,ministry_id,sender_profile_id,body) values($1,$2,$3,'Hello')",[id.church,id.ministry,id.member])
      assert.equal((await inboxFor("leader","chat.message")).length,1)
      assert.equal((await inboxFor("admin","chat.message")).length,1)
      for(const key of ["member","otherLeader","foreign","finance"])assert.equal((await inboxFor(key)).length,0)
      assert.equal((await db.query("select count(*)::int n from private.notification_inbox_push")).rows[0].n,1)
      assert.equal((await db.query("select count(*)::int n from ministry_chat_push_outbox").catch(()=>({rows:[{n:0}]}))).rows[0].n,0)
    })
    await t.test("opening list does not mark read; individual/all read are scoped and bounded",async()=>{
      as("leader");const first=await inbox.listMyInbox({});assert.equal((await inbox.listMyInbox({})).unread,1)
      as("member");await assert.rejects(inbox.markMyInboxRead({action:"read",id:first.items[0].id}),/indisponível/)
      as("leader");await inbox.markMyInboxRead({action:"read-all",through:first.through});assert.equal((await inbox.listMyInbox({})).unread,0)
      assert.equal((await inboxFor("admin")).length,1)
    })
    await t.test("confirmed assignment decline is atomic, optional reason, idempotent and visible in details",async()=>{
      as("member");assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,true)
      const row=(await db.query("select status,decline_reason,responded_at from volunteer_assignments where id=$1",[id.assignment])).rows[0]
      assert.equal(row.status,"declined");assert.equal(row.decline_reason,null);assert.ok(row.responded_at)
      const before=(await db.query("select count(*)::int n from notification_inbox where kind='scale.absence'")).rows[0].n
      assert.equal(before,2)
      assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment,reason:"duplicate"})).ok,true)
      assert.equal((await db.query("select count(*)::int n from notification_inbox where kind='scale.absence'")).rows[0].n,before)
      const result=await details.getMemberMinistryDetails(id.ministry)
      assert.equal(result.activities[0].scale[0].status,"declined");assert.equal(result.activities[0].scale[0].assignmentId,id.assignment)
    })
    await t.test("rejects foreign owner, draft, canceled, started, removed membership and long reason",async()=>{
      as("otherLeader");assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,false)
      as("member");assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment,reason:"x".repeat(501)})).ok,false)
      await db.query("update volunteer_assignments set status='confirmed' where id=$1",[id.assignment])
      await db.query("update events set volunteer_schedule_published_at=null where id=$1",[id.event]);await db.query("update volunteer_schedules set status='draft' where id=$1",[id.schedule])
      assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,false)
      await db.query("update volunteer_schedules set status='published' where id=$1",[id.schedule]);await db.query("update events set status='cancelled' where id=$1",[id.event])
      assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,false)
      await db.query("update events set status='published',volunteer_schedule_published_at=now() where id=$1",[id.event]);await db.query("update volunteer_shifts set starts_at=now()-interval '1 minute' where id=$1",[id.shift])
      assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,false)
      await db.query("update volunteer_shifts set starts_at=now()+interval '2 days' where id=$1",[id.shift]);await db.query("update ministry_memberships set status='inactive' where person_id=$1",[id.member])
      assert.equal((await absence.declineMyPublishedAssignment({assignmentId:id.assignment})).ok,false)
      await db.query("update ministry_memberships set status='active' where person_id=$1",[id.member])
    })
    await t.test("database rollback also removes generated notices",async()=>{
      const before=(await db.query("select count(*)::int n from notification_inbox")).rows[0].n
      await db.exec("begin");await db.query("insert into form_submissions(company_id,form_id) values($1,$2)",[id.church,randomUUID()]);await db.exec("rollback")
      assert.equal((await db.query("select count(*)::int n from notification_inbox")).rows[0].n,before)
    })
    await t.test("RLS denies cross profile/company and direct writes; revocation hides existing chat",async()=>{
      await db.exec(`set role authenticated;select set_config('test.uid','${id.foreign}',false)`)
      assert.equal((await db.query("select count(*)::int n from notification_inbox")).rows[0].n,0)
      await assert.rejects(db.exec("update notification_inbox set read_at=now()"),/permission denied/)
      await db.exec(`reset role;select set_config('test.uid','${id.leader}',false);set role authenticated`)
      assert.ok((await db.query("select count(*)::int n from notification_inbox")).rows[0].n>0)
      await db.exec("reset role")
      await db.query("update ministries set leader_person_id=null where id=$1",[id.ministry]);await db.query("update ministry_memberships set status='inactive' where person_id=$1",[id.leader])
      assert.equal((await inboxFor("leader","chat.message")).length,0)
      await db.query("update ministries set leader_person_id=$1 where id=$2",[id.leader,id.ministry]);await db.query("update ministry_memberships set status='active' where person_id=$1",[id.leader])
    })
    await t.test("volunteer and Kids chats have scoped leaders and exclude regular participants",async()=>{
      const conv=randomUUID();await db.query("insert into volunteer_shift_conversations(id,company_id,shift_id) values($1,$2,$3)",[conv,id.church,id.shift]);await db.query("insert into volunteer_shift_messages(company_id,conversation_id,sender_profile_id,body) values($1,$2,$3,'Chat')",[id.church,conv,id.member])
      await db.query("insert into kid_conversation_messages(company_id,conversation_id,kid_id,sender_profile_id,body) values($1,$2,$3,$4,'Chat')",[id.church,id.conversation,id.kid,id.member])
      assert.equal((await inboxFor("leader","chat.message")).length,3)
      assert.equal((await inboxFor("otherLeader","chat.message")).length,0)
      assert.equal((await inboxFor("member","chat.message")).length,0)
    })
    await t.test("forms, event registrations, cells, Kids incident/pickup/staff, tasks, prayer and announcements",async()=>{
      await db.query("insert into form_submissions(company_id,form_id) values($1,$2)",[id.church,randomUUID()])
      await db.query("insert into event_guest_registrations(company_id,event_id,status) values($1,$2,'registered')",[id.church,id.event])
      await db.query("insert into cell_visit_requests(company_id,group_id,status) values($1,$2,'pending')",[id.church,id.cell])
      await db.query("insert into kid_incidents(company_id,kid_id,title) values($1,$2,'Incident')",[id.church,id.kid])
      await db.query("insert into kid_attendances(company_id,kid_id,checkout_requested_at,checkout_requested_by) values($1,$2,now(),$3)",[id.church,id.kid,id.member])
      await db.query("insert into kid_staff_assignments(company_id,session_id,profile_id) values($1,$2,$3)",[id.church,id.session,id.leader])
      await db.query("insert into automation_tasks(company_id,responsible_id,title,status) values($1,$2,'Task','open')",[id.church,id.communication])
      await db.query("insert into automation_runs(company_id,status) values($1,'review')",[id.church])
      await db.query("insert into prayer_requests(company_id,name,message,status) values($1,'Test','Sensitive','open')",[id.church])
      await db.query("insert into announcements(company_id,title,content,published) values($1,'Notice','Content',true)",[id.church])
      const kinds=(await inboxFor("admin")).map(item=>item.kind)
      for(const kind of ["form.received","event.registration","cell.request","kids.incident","kids.pickup","automation.attention","prayer.changed","announcement.published"])assert.ok(kinds.includes(kind),kind)
      assert.equal((await inboxFor("communication","task.assigned")).length,1)
      assert.equal((await inboxFor("leader","kids.assignment")).length,1)
      assert.equal((await inboxFor("otherLeader","kids.incident")).length,0)
      const kidsNotice=(await inboxFor("leader","kids.incident"))[0]
      assert.ok(kidsNotice.href.startsWith("/notificacoes/"))
      as("leader");assert.equal((await inbox.getMyInboxKidsDetails(kidsNotice.id)).description,"Incident\n")
    })
    await t.test("terminal delivery errors only; recurring due checks deduplicate and honor accumulated finance role",async()=>{
      const delivery=randomUUID();await db.query("insert into integration_delivery_outbox(id,company_id,status,attempts) values($1,$2,'failed',1)",[delivery,id.church])
      assert.equal((await inboxFor("admin","delivery.failed")).length,0)
      await db.query("update integration_delivery_outbox set status='dead',attempts=8,updated_at=now() where id=$1",[delivery])
      assert.equal((await inboxFor("admin","delivery.failed")).length,1)
      await db.query("insert into revenues(company_id,description,received,due_date) values($1,'Sensitive',false,current_date-2)",[id.church]);await db.query("insert into expenses(company_id,description,paid,due_date) values($1,'Sensitive',false,current_date-2)",[id.church])
      await db.query("insert into automation_tasks(company_id,responsible_id,title,status,due_at) values($1,$2,'Due','open',now()-interval '1 day')",[id.church,id.communication])
      await db.exec("select private.detect_operational_notification_due();select private.detect_operational_notification_due()")
      assert.equal((await inboxFor("finance","finance.overdue")).length,2)
      assert.equal((await inboxFor("leader","finance.overdue")).length,0)
      assert.equal((await inboxFor("communication","tasks.overdue")).length,1)
      assert.equal((await db.query("select count(*)::int n from notification_inbox where kind='finance.overdue' and profile_id=$1",[id.finance])).rows[0].n,2)
    })
    await t.test("volunteer registration is scoped and scheduled publications become visible once",async()=>{
      const registration=randomUUID()
      await db.query("insert into volunteer_profiles(id,company_id,person_id,registration_status) values($1,$2,$3,'pending')",[registration,id.church,id.member])
      await db.query("insert into volunteer_department_memberships(company_id,volunteer_id,department_id) values($1,$2,$3)",[id.church,registration,id.department])
      const recipients=(await db.query("select profile_id from notification_inbox where source_id=$1 and kind='volunteer.registration'",[registration])).rows
      assert.deepEqual(recipients.map(r=>r.profile_id).sort(),[id.admin,id.leader].sort())
      await db.query("update volunteer_profiles set registration_status='active',updated_at=clock_timestamp() where id=$1",[registration])
      assert.ok((await inboxFor("member","volunteer.registration")).length)
      const announced=randomUUID();await db.query("insert into announcements(id,company_id,title,content,published,published_at) values($1,$2,'Scheduled','Content',true,now()+interval '1 hour')",[announced,id.church])
      as("member");assert.equal((await inbox.listMyInbox({})).items.some(n=>n.summary==='Scheduled'),false)
      await db.query("update announcements set published_at=clock_timestamp() where id=$1",[announced])
      await db.exec("select private.detect_operational_notification_publications();select private.detect_operational_notification_publications()")
      assert.equal((await db.query("select count(*)::int n from notification_inbox where source_id=$1 and profile_id=$2",[announced,id.member])).rows[0].n,1)
      const cellNotice=randomUUID();await db.query("insert into cell_notices(id,company_id,title,audience,is_active,published_at) values($1,$2,'Scheduled cell','all',true,now()+interval '1 hour')",[cellNotice,id.church])
      await db.query("update cell_notices set published_at=clock_timestamp() where id=$1",[cellNotice])
      await db.query("insert into group_members(company_id,group_id,person_id,status) values($1,$2,$3,'active')",[id.church,id.cell,id.member])
      await db.exec("select private.detect_operational_notification_publications();select private.detect_operational_notification_publications()")
      assert.equal((await db.query("select count(*)::int n from notification_inbox where source_id=$1 and profile_id=$2",[cellNotice,id.member])).rows[0].n,1)
      await db.query("delete from announcements where id=$1",[announced]);await db.query("delete from cell_notices where id=$1",[cellNotice])
      await db.query("delete from group_members where company_id=$1 and group_id=$2 and person_id=$3",[id.church,id.cell,id.member])
    })
    await t.test("stable cursor visits all pages, exact unread count, no overlap, bounded read-all",async()=>{
      for(let i=0;i<35;i++)await db.query("insert into form_submissions(company_id,form_id) values($1,$2)",[id.church,randomUUID()])
      as("admin");const first=await inbox.listMyInbox({module:"forms"});assert.equal(first.items.length,30);assert.ok(first.nextCursor)
      const second=await inbox.listMyInbox({module:"forms",cursor:first.nextCursor});assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,36)
      await db.query("insert into form_submissions(company_id,form_id) values($1,$2)",[id.church,randomUUID()])
      await inbox.markMyInboxRead({action:"read-all",through:first.through});assert.equal((await inbox.listMyInbox({})).unread,1)
    })
    await t.test("scale changes and publication, prayer responses, selected cell announcements and staff removal",async()=>{
      await db.query("insert into group_members(company_id,group_id,person_id,status) values($1,$2,$3,'active')",[id.church,id.cell,id.member])
      const notice=randomUUID();await db.query("insert into cell_notices(id,company_id,title,audience,is_active,published_at) values($1,$2,'Notice','selected',true,now())",[notice,id.church]);
      assert.equal((await inboxFor("member")).filter(item=>item.kind==='announcement.published'&&item.module==='cells').length,0)
      await db.query("insert into cell_notice_targets(company_id,notice_id,group_id) values($1,$2,$3)",[id.church,notice,id.cell])
      assert.equal((await inboxFor("member")).filter(item=>item.kind==='announcement.published'&&item.module==='cells').length,1)
      const request=randomUUID();await db.query("insert into cell_prayer_requests(id,company_id,group_id,author_person_id,author_profile_id,status) values($1,$2,$3,$4,$4,'open')",[request,id.church,id.cell,id.member]);await db.query("update cell_prayer_requests set status='answered',updated_at=now() where id=$1",[request])
      assert.equal((await inboxFor("member","prayer.changed")).length,1)
      await db.query("update volunteer_shifts set role_name='New role',updated_at=now() where id=$1",[id.shift]);assert.ok((await inboxFor("member","scale.changed")).length>0)
      const publications=(await inboxFor("member","scale.published")).length;
      await db.query("update volunteer_schedules set status='draft' where id=$1",[id.schedule]);await db.query("update volunteer_schedules set status='published',updated_at=now() where id=$1",[id.schedule]);assert.equal((await inboxFor("member","scale.published")).length,publications+1)
      await db.query("delete from kid_staff_assignments where profile_id=$1",[id.leader]);assert.equal((await inboxFor("leader","kids.assignment")).length,1)
    })
    await t.test("push uses real queue with mocked provider, honors silence/read/revocation, retries and expires devices",async()=>{
      await db.exec("delete from private.notification_inbox_push")
      globalThis.__inboxTest.pushes=[];globalThis.__inboxTest.pushError=null
      const provider=inline(`export default {setVapidDetails(){},async sendNotification(target,body){if(globalThis.__inboxTest.pushError)throw globalThis.__inboxTest.pushError;globalThis.__inboxTest.pushes.push({target,body:JSON.parse(body)})}}`)
      const urlGuard=inline("export const assertResolvableSafeWebhookUrl=async()=>{}")
      const push=await import(await loadModule("../src/lib/notifications/inbox-push.ts",{"@/lib/db/client":stubs,"web-push":provider,"@/lib/integrations/crypto":urlGuard}))
      const oldEnv=Object.fromEntries(["VAPID_SUBJECT","NEXT_PUBLIC_VAPID_PUBLIC_KEY","VAPID_PRIVATE_KEY"].map(key=>[key,process.env[key]]))
      Object.assign(process.env,{VAPID_SUBJECT:"mailto:test@example.test",NEXT_PUBLIC_VAPID_PUBLIC_KEY:"test",VAPID_PRIVATE_KEY:"test"})
      const send=async()=>await db.query("insert into ministry_chat_messages(company_id,ministry_id,sender_profile_id,body) values($1,$2,$3,'Message') returning id",[id.church,id.ministry,id.member])
      try{
        await send();assert.equal((await push.processInboxPush()).sent,1);assert.equal(globalThis.__inboxTest.pushes.length,1)
        await db.query("insert into ministry_chat_reads(company_id,ministry_id,profile_id,muted,push_opted_out) values($1,$2,$3,true,false)",[id.church,id.ministry,id.leader]);await send();assert.equal((await push.processInboxPush()).sent,0)
        await db.query("update ministry_chat_reads set muted=false where profile_id=$1",[id.leader]);const msg=(await send()).rows[0];await db.query("update ministry_chat_reads set last_read_at=(select created_at from ministry_chat_messages where id=$1),last_read_id=$1 where profile_id=$2",[msg.id,id.leader]);assert.equal((await push.processInboxPush()).sent,0)
        await send();globalThis.__inboxTest.pushError={statusCode:503};assert.equal((await push.processInboxPush()).failed,1)
        assert.equal((await db.query("select count(*)::int n from private.notification_inbox_push where status='failed' and attempts=1")).rows[0].n,1)
        await db.exec("update private.notification_inbox_push set next_attempt_at=now() where status='failed'");globalThis.__inboxTest.pushError={statusCode:410};assert.equal((await push.processInboxPush()).failed,1)
        assert.equal((await db.query("select is_active from notification_push_subscriptions where id=$1",[id.subscription])).rows[0].is_active,false)
        await db.query("update notification_push_subscriptions set is_active=true where id=$1",[id.subscription]);globalThis.__inboxTest.pushError=null;await send();await db.query("update profiles set active=false where id=$1",[id.leader]);assert.equal((await push.processInboxPush()).sent,0);await db.query("update profiles set active=true where id=$1",[id.leader])
      }finally{for(const [key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
    })
  } finally {delete globalThis.__inboxTest;await db.close()}
})
