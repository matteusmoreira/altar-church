// Controlled pilot: real sessions/database, synthetic ministry and assignment, test tenant only.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import postgres from "postgres"
import ts from "typescript"
import { chromium, expect } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"

const root = process.cwd()
const baseURL = process.env.INBOX_PILOT_BASE_URL || "http://localhost:3127"
const docPath = process.env.E2E_ACCOUNTS_DOC || resolve(root, "docs/testing/e2e-accounts.local.md")
const document = JSON.parse((await readFile(docPath,"utf8")).match(/```json\s*([\s\S]*?)```/)[1])
if (process.env.E2E_COMPANY_LEGACY_ID && process.env.E2E_COMPANY_LEGACY_ID !== document.companyLegacyId) throw new Error("Tenant de teste diferente do ambiente")
process.env.E2E_COMPANY_LEGACY_ID = document.companyLegacyId
const source = ts.transpileModule(await readFile(resolve(root,"tests/e2e/helpers/accounts.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {readE2EAccounts} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const accounts = readE2EAccounts(docPath)
const sql = postgres(process.env.POSTGRES_URL,{max:4,prepare:false,connect_timeout:10,connection:{statement_timeout:15000}})
const prefix = `e2e-inbox-${randomUUID().slice(0,8)}`
const ids = { ministry:randomUUID(),department:randomUUID(),event:randomUUID(),shift:randomUUID(),assignment:randomUUID() }
let browser, company, scheduleId, scheduleCreated = false
const contexts = []
async function authenticate(account, viewport, dark = false) {
  const context = await browser.newContext({baseURL,viewport,colorScheme:dark?"dark":"light"})
  contexts.push(context)
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:"Lax"})))}})
  const result = await client.auth.signInWithPassword({email:account.email,password:account.password})
  assert.equal(result.error?.code || null,null,"Autenticação do piloto")
  await context.addInitScript(dark=>localStorage.setItem("theme",dark?"dark":"light"),dark)
  return context.newPage()
}
async function inbox(page) {
  const result=await page.request.get("/api/v1/notifications/inbox")
  assert.equal(result.status(),200)
  return (await result.json()).data
}
try {
  const [tenant] = await sql`select id,status,active from public.companies where legacy_id=${accounts.companyLegacyId}`
  assert.equal(tenant?.status,"test");assert.equal(tenant.active,true);company=tenant.id
  assert.equal((await sql`select count(*)::int n from public.notification_push_subscriptions where company_id=${company} and is_active`)[0].n,0,"Piloto não pode disparar push a dispositivos existentes")
  assert.equal((await sql`select count(*)::int n from public.automation_flows where company_id=${company} and status='active'`)[0].n,0,"Piloto exige automações desativadas")
  const profiles = await sql`select p.id,p.email,person.id person_id,v.id volunteer_id from public.profiles p
    left join public.people person on person.company_id=p.company_id and person.profile_id=p.id and person.deleted_at is null
    left join public.volunteer_profiles v on v.company_id=p.company_id and v.person_id=person.id and v.deleted_at is null and v.registration_status='active'
    where p.company_id=${company} and p.active and p.deleted_at is null`
  const volunteer = profiles.find(p=>p.email.toLowerCase()===accounts.portalAccounts.volunteer.email.toLowerCase())
  const leader = profiles.find(p=>p.email.toLowerCase()===accounts.portalAccounts.ministryLeader.email.toLowerCase())
  const admin = profiles.find(p=>p.email.toLowerCase()===accounts.accounts.admin.email.toLowerCase())
  assert.ok(volunteer?.volunteer_id && volunteer.person_id && leader?.person_id && admin?.id)
  const starts = new Date(Date.now()+2*86400000), ends = new Date(starts.getTime()+2*3600000)
  const month = `${starts.getUTCFullYear()}-${String(starts.getUTCMonth()+1).padStart(2,"0")}-01`
  await sql.begin(async tx=>{
    await tx`insert into public.ministries(id,company_id,name,slug,description,contact,meeting_day,meeting_time,meeting_location,created_by)
      values(${ids.ministry},${company},${prefix},${prefix},'Resumo completo do ministério fictício','Contato do piloto',0,'09:00','Templo de teste',${admin.id})`
    await tx`insert into public.ministry_memberships(company_id,ministry_id,person_id,role,status)
      values(${company},${ids.ministry},${volunteer.person_id},'member','active'),(${company},${ids.ministry},${leader.person_id},'leader','active')`
    await tx`insert into public.volunteer_departments(id,company_id,ministry_id,name,manager_profile_id)
      values(${ids.department},${company},${ids.ministry},${prefix},${admin.id})`
    const existing = await tx`select id from public.volunteer_schedules where company_id=${company} and month=${month}::date`
    scheduleId=existing[0]?.id
    if (!scheduleId) {scheduleId=randomUUID();scheduleCreated=true;await tx`insert into public.volunteer_schedules(id,company_id,month,status) values(${scheduleId},${company},${month}::date,'published')`}
    await tx`insert into public.events(id,company_id,ministry_id,title,description,starts_at,ends_at,location,status,volunteer_schedule_published_at,created_by)
      values(${ids.event},${company},${ids.ministry},${prefix},'Instruções completas do encontro',${starts},${ends},'Sala de teste','published',now(),${admin.id})`
    await tx`insert into public.volunteer_shifts(id,company_id,event_id,schedule_id,department_id,role_name,starts_at,ends_at,checkin_opens_at,checkin_closes_at,instructions)
      values(${ids.shift},${company},${ids.event},${scheduleId},${ids.department},'Som do piloto',${starts},${ends},${starts},${ends},'Chegar 30 minutos antes')`
    await tx`insert into public.volunteer_assignments(id,company_id,shift_id,volunteer_id,status)
      values(${ids.assignment},${company},${ids.shift},${volunteer.volunteer_id},'confirmed')`
  })
  browser=await chromium.launch({headless:true})
  const output=resolve(root,"test-results/notification-inbox-pilot");await mkdir(output,{recursive:true})
  const errors=[]
  const memberPage=await authenticate(accounts.portalAccounts.volunteer,{width:390,height:844},true)
  const adminPage=await authenticate(accounts.accounts.admin,{width:1440,height:1000})
  const leaderPage=await authenticate(accounts.portalAccounts.ministryLeader,{width:390,height:844})
  for(const page of [memberPage,adminPage,leaderPage])page.on("pageerror",e=>errors.push(e.message))
  await memberPage.goto(`/membro/ministerios?ministry=${ids.ministry}`)
  const details=memberPage.getByRole("dialog")
  await expect(details.getByText("Resumo completo do ministério fictício")).toBeVisible()
  await expect(details.getByText("Domingo",{exact:false})).toBeVisible()
  await expect(details.getByText("Som do piloto · Sua função")).toBeVisible()
  await expect(details.getByText("Chegar 30 minutos antes")).toBeVisible()
  assert.equal(await memberPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await memberPage.screenshot({path:resolve(output,"member-mobile-dark.png")})
  await details.getByRole("button",{name:"Não conseguirei ir"}).click()
  await details.getByLabel("Justificativa (opcional)").fill("Compromisso familiar fictício")
  await details.getByRole("button",{name:"Confirmar ausência"}).click()
  await expect(details.getByText("Ausência avisada à liderança",{exact:true})).toBeVisible()
  await memberPage.reload()
  await expect(memberPage.getByRole("dialog").getByText("Compromisso familiar fictício",{exact:true})).toBeVisible()
  assert.deepEqual((await sql`select status,decline_reason from public.volunteer_assignments where id=${ids.assignment}`)[0],{status:"declined",decline_reason:"Compromisso familiar fictício"})
  const [absence]=await sql`select count(*)::int n,array_agg(profile_id order by profile_id) recipients from public.notification_inbox where company_id=${company} and source_id=${ids.assignment} and kind='scale.absence'`
  assert.equal(absence.n,2);assert.deepEqual(absence.recipients.sort(),[leader.id,admin.id].sort())
  await memberPage.keyboard.press("Escape");await expect(memberPage.getByRole("dialog")).toHaveCount(0)
  // A real chat API write creates a notice independently of the author browser.
  const posted=await memberPage.request.post(`/api/v1/ministries/${ids.ministry}/chat`,{data:{body:`Mensagem fictícia ${prefix}`,clientId:randomUUID()}})
  assert.equal(posted.status(),201)
  await adminPage.goto("/dashboard")
  const before=await inbox(adminPage)
  const chatNotice=before.items.find(n=>n.kind==="chat.message"&&n.summary===prefix)
  assert.ok(chatNotice)
  await adminPage.getByRole("button",{name:/^Notificações/}).filter({visible:true}).first().click()
  await expect(adminPage.getByRole("dialog").getByText("Nova mensagem no ministério")).toBeVisible()
  assert.equal((await inbox(adminPage)).unread,before.unread,"Abrir sininho preserva leitura")
  await adminPage.screenshot({path:resolve(output,"admin-desktop-light.png")})
  await adminPage.getByRole("dialog").getByRole("button").filter({hasText:prefix}).filter({hasText:"Nova mensagem no ministério"}).click()
  await expect(adminPage).toHaveURL(/\/ministerios\/[^/]+\/chat/)
  await expect(adminPage.getByText(`Mensagem fictícia ${prefix}`,{exact:true})).toBeVisible()
  assert.ok((await inbox(adminPage)).items.find(n=>n.id===chatNotice.id)?.readAt)
  await adminPage.reload();assert.ok((await inbox(adminPage)).items.find(n=>n.id===chatNotice.id)?.readAt)
  await leaderPage.goto("/membro")
  await leaderPage.getByRole("button",{name:/^Notificações/}).click()
  await expect(leaderPage.getByRole("dialog").getByText("Nova mensagem no ministério")).toBeVisible()
  assert.equal(await leaderPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await leaderPage.screenshot({path:resolve(output,"leader-mobile-light.png")})
  assert.equal((await inbox(memberPage)).items.some(n=>n.id===chatNotice.id),false)
  await leaderPage.keyboard.press("Escape")
  // Close Realtime before a new event: the visible-page fallback must recover it.
  await leaderPage.context().routeWebSocket(/supabase\.co\/realtime/,socket=>socket.close())
  await leaderPage.reload()
  const previousUnread=(await inbox(leaderPage)).unread
  const recovered=await memberPage.request.post(`/api/v1/ministries/${ids.ministry}/chat`,{data:{body:`Recuperação fictícia ${prefix}`,clientId:randomUUID()}})
  assert.equal(recovered.status(),201)
  await expect(leaderPage.getByRole("button",{name:new RegExp(`^Notificações, ${previousUnread+1} não lidas`)})).toBeVisible({timeout:40_000})
  // Simulate a leader replacing the assignment while the member is submitting.
  await sql`update public.volunteer_assignments set status='confirmed',decline_reason=null,updated_by=${admin.id} where id=${ids.assignment} and company_id=${company}`
  await memberPage.reload()
  await memberPage.getByRole("dialog").getByRole("button",{name:"Não conseguirei ir"}).click()
  let release, acquired
  const locked=new Promise(resolve=>{acquired=resolve}), gate=new Promise(resolve=>{release=resolve})
  const replacement=sql.begin(async tx=>{
    await tx`select id from public.volunteer_shifts where id=${ids.shift} and company_id=${company} for update`
    await tx`update public.volunteer_assignments set status='cancelled',decline_reason=null,updated_by=${admin.id} where id=${ids.assignment} and company_id=${company}`
    acquired();await gate
  })
  await locked
  try { await memberPage.getByRole("dialog").getByRole("button",{name:"Confirmar ausência"}).click();await new Promise(resolve=>setTimeout(resolve,300)) }
  finally { release();await replacement }
  await expect(memberPage.getByRole("dialog").getByRole("button",{name:"Confirmar ausência"})).toBeEnabled()
  assert.equal((await sql`select status from public.volunteer_assignments where id=${ids.assignment}`)[0].status,"cancelled")
  assert.equal((await sql`select count(*)::int n from public.notification_inbox where source_id=${ids.assignment} and kind='scale.absence'`)[0].n,2,"Substituição concorrente não pode emitir outra ausência")
  const [adminRoles] = await sql`select role,roles from public.profiles where id=${admin.id} and company_id=${company}`
  try {
    await sql`update public.profiles set role='member',roles=array['member','admin']::text[] where id=${admin.id} and company_id=${company}`
    await adminPage.goto("/dashboard")
    await expect(adminPage).toHaveURL(/\/dashboard$/)
    assert.equal((await inbox(adminPage)).items.some(n=>n.kind==='scale.absence'),true,"Papéis acumulados preservam avisos administrativos")
  } finally { await sql`update public.profiles set role=${adminRoles.role},roles=${sql.array(adminRoles.roles)}::text[] where id=${admin.id} and company_id=${company}` }
  assert.deepEqual(errors,[])
  console.log("PASS: real test-tenant sessions, mobile/dark ministry details, confirmed absence/reload, exact recipients, chat API, bell/read/link, desktop/light, leader mobile/keyboard, loss of Realtime/poll recovery, concurrent replacement and accumulated member/admin roles")
} finally {
  for(const context of contexts)await context.close()
  await browser?.close()
  if(company){
    await sql`delete from public.notification_inbox where company_id=${company} and (source_id=any(${Object.values(ids)}) or scope_id=any(${Object.values(ids)}))`
    await sql`delete from public.audit_logs where company_id=${company} and entity_id=any(${Object.values(ids)})`
    await sql`delete from public.volunteer_shifts where id=${ids.shift} and company_id=${company}`
    await sql`delete from public.events where id=${ids.event} and company_id=${company}`
    await sql`delete from public.volunteer_departments where id=${ids.department} and company_id=${company}`
    await sql`delete from public.ministries where id=${ids.ministry} and company_id=${company}`
    await sql`delete from route_private.slug_reservations where company_id=${company} and entity_id=any(${Object.values(ids)}) and slug like ${prefix+'%'}`
    if(scheduleCreated)await sql`delete from public.volunteer_schedules where id=${scheduleId} and company_id=${company}`
    assert.equal((await sql`select count(*)::int n from public.notification_inbox where company_id=${company} and (source_id=any(${Object.values(ids)}) or scope_id=any(${Object.values(ids)}))`)[0].n,0)
    console.log("CLEANUP: synthetic ministry, event, assignment, inbox, push and audit removed")
  }
  await sql.end()
}
