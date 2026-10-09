import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import ts from "typescript"
const inline = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
async function moduleUrl(file, replacements = {}) {
  let source = ts.transpileModule(await readFile(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace(/import "server-only";?/g, "")
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(`from "${from}"`, `from "${to}"`)
  return inline(source)
}
function adapter(client) {
  const sql = (parts, ...values) => {
    let query = "", parameters = []
    for (let index = 0; index < parts.length; index++) {
      query += parts[index]
      if (index >= values.length) continue
      const value = values[index]
      if (value?.fragment) { query += value.query.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + parameters.length}`); parameters.push(...value.parameters) }
      else { parameters.push(value); query += `$${parameters.length}` }
    }
    return { fragment: true, query, parameters, then: (resolve, reject) => client.query(query, parameters).then(result => result.rows).then(resolve, reject) }
  }
  sql.begin = callback => client.transaction(transaction => callback(adapter(transaction)))
  return sql
}
const contract = await import(await moduleUrl("src/lib/events/contract.ts"))
test("event value: Brazilian currency and explicit closure", () => {
  for (const [value, cents] of [["150,50",15050],["1.250,90",125090],["0",0],["1,5",150],["",0]]) assert.equal(contract.parseEventValue(value), cents)
  for (const value of ["-10", "150.50", "1,234", "abc", "999999999999999999"]) assert.throws(() => contract.parseEventValue(value))
  assert.equal(contract.eventLocalDateTime("2026-10-09T01:30:00Z", "America/Sao_Paulo"), "2026-10-08T22:30")
  assert.equal(contract.eventLocalDateTime("2026-10-09T01:30:00Z", "America/Manaus"), "2026-10-08T21:30")
  assert.equal(contract.eventValueLabel(0), "Gratuito")
  assert.match(contract.eventValueLabel(15050), /150,50/)
  const event = { startsAt:"2026-10-09T10:00:00Z", endsAt:null, registrationEnabled:true }
  assert.equal(contract.eventRegistrationOpen(event,Date.parse("2026-10-09T12:59:59Z")),true)
  assert.equal(contract.eventRegistrationOpen(event,Date.parse("2026-10-09T13:00:00Z")),false)
  assert.equal(contract.eventRegistrationOpen({...event,registrationEnabled:false},0),false)
})

test("external registration validates HTTPS and never labels missing prices as free", () => {
  assert.deepEqual(contract.parseEventRegistrationSettings('external',' Sympla ',' https://www.sympla.com.br/evento/teste '), {registrationMode:'external',externalPlatform:'Sympla',externalTicketUrl:'https://www.sympla.com.br/evento/teste'})
  assert.equal(contract.parseEventRegistrationSettings('internal','Other','http://ignored').externalTicketUrl,'')
  for(const url of ['', 'http://sympla.com.br/teste','javascript:alert(1)','https://','https://user:password@sympla.com.br/teste','https://sympla.com.br/a b']) assert.throws(()=>contract.parseEventRegistrationSettings('external','Sympla',url))
  assert.throws(()=>contract.parseEventRegistrationSettings('other'))
  assert.throws(()=>contract.parseEventRegistrationSettings('external','A','https://example.com'))
  assert.equal(contract.eventPriceLabel({registrationMode:'external',valueCents:0,externalPlatform:'Sympla'}),'Consulte os valores no Sympla')
  assert.match(contract.eventPriceLabel({registrationMode:'external',valueCents:15050}),/150,50/)
  assert.equal(contract.eventRegistrationOpen({registrationMode:'external',registrationEnabled:true,startsAt:new Date().toISOString(),endsAt:null}),false)
})

test("real event actions and migration on isolated PostgreSQL", async t => {
  const db = new PGlite()
  const id = Object.fromEntries(["company","otherCompany","event","admin","member","guest","session","waitingGuest","waitingMember","token"].map(key => [key, randomUUID()]))
  const sql = adapter(db)
  globalThis.__eventTest = { sql, companyId:id.company, user:{id:id.admin,name:"Admin de teste",churchId:id.company}, allowed:true }
  try {
    await db.exec(`create table audit_logs(company_id uuid, action text, entity_table text, entity_id uuid, metadata jsonb);
      create table app_files(id uuid primary key);
      create table events(id uuid primary key default gen_random_uuid(), company_id uuid, title text, status text default 'published', registration_enabled boolean default true, max_capacity integer default 0, starts_at timestamptz default now(), ends_at timestamptz default now()+interval '3 hours', programming_id uuid, deleted_at timestamptz);
      create table programmings(id uuid, company_id uuid, source_event_id uuid);
      create table church_profiles(company_id uuid, timezone text);
      create table people(id uuid primary key, company_id uuid, full_name text, phone text, is_active boolean default true, deleted_at timestamptz);
      create table member_event_rsvps(id uuid primary key default gen_random_uuid(), company_id uuid, event_id uuid, person_id uuid, status text, created_at timestamptz default now(), updated_at timestamptz default now());
      create table event_guest_registrations(id uuid primary key default gen_random_uuid(), company_id uuid, event_id uuid, full_name text, email text default '', phone text default '', consent_at timestamptz, status text, confirmation_token uuid default gen_random_uuid(), checked_in_at timestamptz, canceled_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
      create table event_attendee_tokens(token uuid primary key default gen_random_uuid(), company_id uuid, event_id uuid, member_rsvp_id uuid, guest_registration_id uuid, created_by uuid, expires_at timestamptz);
      create unique index attendee_guest on event_attendee_tokens(guest_registration_id) where guest_registration_id is not null;
      create unique index attendee_member on event_attendee_tokens(member_rsvp_id) where member_rsvp_id is not null;
      create table event_checkin_sessions(token uuid primary key default gen_random_uuid(), company_id uuid, event_id uuid, opens_at timestamptz, expires_at timestamptz, closed_at timestamptz, created_by uuid);
      create table attendance_records(id uuid primary key default gen_random_uuid(), company_id uuid, person_id uuid, person_name text, event_type text, event_ref_id uuid, event_ref_name text, occurred_on date, occurred_time time, status text, registered_by uuid, registered_by_name text, guest_registration_id uuid, checkin_source text, event_checkin_session_token uuid, checkin_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz);
      create unique index attendance_person on attendance_records(company_id,event_ref_id,person_id) where event_type='event' and person_id is not null and deleted_at is null;
      create unique index attendance_guest on attendance_records(company_id,event_ref_id,guest_registration_id) where event_type='event' and guest_registration_id is not null and deleted_at is null;`)
    await db.query("insert into events(id,company_id,title,max_capacity) values($1,$2,'Evento profissional',1)",[id.event,id.company])
    await db.query("insert into church_profiles values($1,'America/Sao_Paulo')",[id.company])
    await db.query("insert into people(id,company_id,full_name,phone) values($1,$2,'Membro','11999990000')",[id.member,id.company])
    await db.exec(await readFile("supabase/migrations/20261009184330_professional_events.sql","utf8"))
    await db.exec(await readFile("supabase/migrations/20261009192419_event_external_registration.sql","utf8"))
    const defaults=(await db.query("select value_cents,allow_walk_ins from events")).rows[0]
    assert.deepEqual(defaults,{value_cents:0,allow_walk_ins:true})
    await assert.rejects(db.query("update events set value_cents=-1"))
    const stub = inline(`export const getSql=()=>globalThis.__eventTest.sql;
      export const getCurrentUser=async()=>globalThis.__eventTest.user;
      export const requireUserCompanyId=()=>globalThis.__eventTest.companyId;
      export const requirePermission=async()=>{if(!globalThis.__eventTest.allowed)throw new Error('Acesso negado')};
      export const writeAuditLog=async()=>{};export const revalidatePath=()=>{};
      export const consumePublicRateLimit=async()=>true;
      export const uploadManagedFile=async()=>{throw new Error('Unused')};
      export const getPublicEventByToken=async()=>null;
      export const eventCommunicationTemplates=[];`)
    const helpers = await moduleUrl("src/lib/events/registration-server.ts")
    const actions = await import(await moduleUrl("src/lib/events/actions.ts", {"next/cache":stub,"@/lib/auth/permissions":stub,"@/lib/auth/server":stub,"@/lib/db/client":stub,"./data":stub,"./types":stub,"@/lib/security/public-rate-limit":stub,"@/lib/files/server":stub,"./registration-server":helpers,"zod":pathToFileURL(resolve("node_modules/zod/index.js")).href}))
    let memberRegistration, guestRegistration
    await t.test("simultaneous member and guest registrations share the last place",async()=>{
      const responses=await Promise.all([actions.registerEventParticipant({eventId:id.event,personId:id.member}), actions.registerEventParticipant({eventId:id.event,fullName:"Visitante",phone:"11988880000",consent:true})])
      assert.ok(responses.every(r=>r.ok),JSON.stringify(responses));assert.deepEqual(responses.map(r=>r.status).sort(),["going","waitlisted"])
      memberRegistration=responses[0].id;guestRegistration=responses[1].id
      const duplicate=await actions.registerEventParticipant({eventId:id.event,personId:id.member});assert.equal(duplicate.ok,false)
    })
    await t.test("cancellation promotes the oldest candidate across both kinds",async()=>{
      await db.query("insert into member_event_rsvps(id,company_id,event_id,person_id,status,created_at) values($1,$2,$3,$4,'waitlisted',now()+interval '1 hour')",[id.waitingMember,id.company,id.event,randomUUID()])
      const result=await actions.cancelEventParticipant({eventId:id.event,kind:"member",attendeeId:memberRegistration});assert.equal(result.ok,true)
      assert.equal((await db.query("select status from event_guest_registrations where id=$1",[guestRegistration])).rows[0].status,"going")
      assert.equal((await db.query("select status from member_event_rsvps where id=$1",[id.waitingMember])).rows[0].status,"waitlisted")
    })
    await t.test("opening twice preserves session; manual and QR preserve first entrance",async()=>{
      const a=await actions.createEventCheckinSession(id.event);const b=await actions.createEventCheckinSession(id.event);assert.equal(a.ok,true,JSON.stringify(a));assert.equal(a.token,b.token)
      const first=await actions.manualCheckInEventParticipant({eventId:id.event,kind:"guest",attendeeId:guestRegistration});assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.alreadyCheckedIn,false)
      const before=(await db.query("select checkin_at,occurred_time from attendance_records")).rows[0]
      const token=(await db.query("select token from event_attendee_tokens where guest_registration_id=$1",[guestRegistration])).rows[0].token
      const second=await actions.checkInEventAttendee(token);assert.equal(second.ok,true);assert.equal(second.alreadyCheckedIn,true)
      const after=(await db.query("select checkin_at,occurred_time from attendance_records")).rows[0];assert.deepEqual(after,before)
      assert.equal((await db.query("select count(*)::int n from attendance_records")).rows[0].n,1)
      assert.equal((await db.query("select occurred_on=(checkin_at at time zone 'America/Sao_Paulo')::date correct from attendance_records")).rows[0].correct,true)
    })
    await t.test("waitlist, foreign event QR, closed and expired sessions cannot enter",async()=>{
      assert.equal((await actions.manualCheckInEventParticipant({eventId:id.event,kind:"member",attendeeId:id.waitingMember})).ok,false)
      const token=(await db.query("select token from event_attendee_tokens where guest_registration_id=$1",[guestRegistration])).rows[0].token
      assert.equal((await actions.receptionEventQr({eventId:randomUUID(),token})).ok,false)
      await db.exec("update event_attendee_tokens set expires_at=now()-interval '1 second'");assert.equal((await actions.checkInEventAttendee(token)).ok,false);await db.exec("update event_attendee_tokens set expires_at=null")
      assert.equal((await actions.closeEventCheckinSession(id.event)).ok,true)
      assert.equal((await actions.checkInEventAttendee(token)).ok,false)
      await actions.createEventCheckinSession(id.event)
      await db.exec("update event_checkin_sessions set expires_at=now()-interval '1 second'")
      assert.equal((await actions.manualCheckInEventParticipant({eventId:id.event,kind:"guest",attendeeId:guestRegistration})).ok,false)
    })
    await t.test("walk-ins obey configuration, capacity and consent",async()=>{
      await actions.createEventCheckinSession(id.event)
      const session=(await db.query("select token from event_checkin_sessions where closed_at is null order by opens_at desc limit 1")).rows[0].token
      const input={sessionToken:session,fullName:"Sem inscrição",phone:"11977770000",consent:true}
      assert.equal((await actions.checkInEventSession({...input,consent:false})).ok,false)
      await db.exec("update events set allow_walk_ins=false")
      assert.match((await actions.checkInEventSession(input)).error,/inscrição prévia/)
      await db.exec("update events set allow_walk_ins=true")
      assert.match((await actions.checkInEventSession(input)).error,/lotado/)
      await db.exec("update events set max_capacity=0")
      const entered=await actions.checkInEventSession(input);assert.equal(entered.ok,true,JSON.stringify(entered))
      const again=await actions.checkInEventSession(input);assert.equal(again.alreadyCheckedIn,true)
    })
    await t.test("a promoted member receives an individual QR",async()=>{
      const eventId=randomUUID(),rsvpId=randomUUID(),guestId=randomUUID()
      await db.query("insert into events(id,company_id,title,max_capacity) values($1,$2,'Promoção',1)",[eventId,id.company])
      await db.query("insert into member_event_rsvps(id,company_id,event_id,person_id,status) values($1,$2,$3,$4,'waitlisted')",[rsvpId,id.company,eventId,id.member])
      await db.query("insert into event_guest_registrations(id,company_id,event_id,full_name,status) values($1,$2,$3,'Visitante','going')",[guestId,id.company,eventId])
      assert.equal((await actions.cancelEventParticipant({eventId,kind:'guest',attendeeId:guestId})).ok,true)
      assert.equal((await db.query("select status from member_event_rsvps where id=$1",[rsvpId])).rows[0].status,'going')
      assert.equal((await db.query("select count(*)::int n from event_attendee_tokens where member_rsvp_id=$1",[rsvpId])).rows[0].n,1)
    })
    await t.test("external conversion preserves history and rejects active registrations and open sessions",async()=>{
      const eventId=randomUUID(),rsvpId=randomUUID(),guestId=randomUUID()
      await db.query("insert into events(id,company_id,title,max_capacity) values($1,$2,'Externo',1)",[eventId,id.company])
      await db.query("insert into member_event_rsvps(id,company_id,event_id,person_id,status) values($1,$2,$3,$4,'going')",[rsvpId,id.company,eventId,id.member])
      await db.query("insert into event_guest_registrations(id,company_id,event_id,full_name,status) values($1,$2,$3,'Visitante','waitlisted')",[guestId,id.company,eventId])
      const convert=()=>db.query("update events set registration_mode='external',external_ticket_url='https://www.sympla.com.br/evento/teste',registration_enabled=false,allow_walk_ins=false where id=$1",[eventId])
      await assert.rejects(convert(),/inscrições internas/)
      await db.query("update member_event_rsvps set status='canceled' where event_id=$1",[eventId]);await assert.rejects(convert(),/inscrições internas/)
      await db.query("update event_guest_registrations set status='canceled' where event_id=$1",[eventId])
      assert.equal((await actions.createEventCheckinSession(eventId)).ok,true)
      await assert.rejects(convert(),/sessões de check-in/)
      assert.equal((await actions.closeEventCheckinSession(eventId)).ok,true)
      await convert()
      assert.equal((await db.query("select count(*)::int n from member_event_rsvps where event_id=$1",[eventId])).rows[0].n,1)
      assert.equal((await db.query("select count(*)::int n from event_guest_registrations where event_id=$1",[eventId])).rows[0].n,1)
      assert.equal((await actions.registerEventParticipant({eventId,personId:id.member})).ok,false)
      assert.equal((await actions.registerEventParticipant({eventId,fullName:'Bloqueado',phone:'11999999999',consent:true})).ok,false)
      assert.equal((await actions.createEventCheckinSession(eventId)).ok,false)
      assert.equal((await actions.manualCheckInEventParticipant({eventId,kind:'member',attendeeId:rsvpId})).ok,false)
      assert.equal((await actions.issueEventAttendeeToken({eventId,kind:'member',attendeeId:rsvpId})).ok,false)
      await db.query("insert into event_attendee_tokens(company_id,event_id,member_rsvp_id) values($1,$2,$3)",[id.company,eventId,rsvpId])
      const [token]=(await db.query("select token from event_attendee_tokens where member_rsvp_id=$1",[rsvpId])).rows
      assert.equal((await actions.checkInEventAttendee(token.token)).ok,false)
      assert.equal((await actions.receptionEventQr({eventId,token:token.token})).ok,false)
      const [session]=(await db.query("select token from event_checkin_sessions where event_id=$1",[eventId])).rows
      assert.equal((await actions.checkInEventSession({sessionToken:session.token,fullName:'Bloqueado',phone:'11999999999',consent:true})).ok,false)
      await assert.rejects(db.query("update events set registration_enabled=true where id=$1",[eventId]))
      await assert.rejects(db.query("update events set external_ticket_url='http://example.com' where id=$1",[eventId]))
      const programmingId=randomUUID(),occurrenceId=randomUUID()
      await db.query("insert into programmings values($1,$2,$3)",[programmingId,id.company,eventId])
      await db.query("insert into events(id,company_id,title,programming_id) values($1,$2,'Ocorrência',$3)",[occurrenceId,id.company,programmingId])
      assert.equal((await db.query("select registration_mode from events where id=$1",[occurrenceId])).rows[0].registration_mode,'external')
    })
    await t.test("cancelled, ended, disabled events and foreign tenant mutations are denied",async()=>{
      globalThis.__eventTest.companyId=id.otherCompany
      assert.equal((await actions.registerEventParticipant({eventId:id.event,personId:id.member})).ok,false)
      globalThis.__eventTest.companyId=id.company;globalThis.__eventTest.allowed=false
      assert.equal((await actions.createEventCheckinSession(id.event)).ok,false)
      globalThis.__eventTest.allowed=true
      for(const update of ["status='cancelled'","status='published',ends_at=now()-interval '1 second'","ends_at=now()+interval '1 hour',registration_enabled=false"]){await db.exec(`update events set ${update}`);assert.equal((await actions.registerEventParticipant({eventId:id.event,personId:id.member})).ok,false)}
    })
  } finally { await db.close();delete globalThis.__eventTest }
})
