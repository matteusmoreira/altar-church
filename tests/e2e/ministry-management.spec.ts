import { randomUUID } from "node:crypto"
import { test, expect, type BrowserContext } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"
import postgres from "postgres"
import { readE2EAccounts, type E2EAccount } from "./helpers/accounts"

async function authenticate(context: BrowserContext, account: E2EAccount, baseURL: string) {
  const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,{
      cookies:{getAll:()=>[],setAll:async cookies=>{await context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:"Lax" as const}))) }},
    })
  const result=await client.auth.signInWithPassword({email:account.email,password:account.password})
  expect(result.error?.code || null).toBeNull()
}

test("gestão do ministério com banco e sessões reais em igreja de teste",async({browser,baseURL})=>{
  const accounts=readE2EAccounts()
  const options={max:1,prepare:false,max_pipeline:0,connect_timeout:10,connection:{statement_timeout:15000}}
  const sql=postgres(process.env.POSTGRES_URL!,options)
  const adminContext=await browser.newContext({baseURL,viewport:{width:1440,height:1000}})
  const leaderContext=await browser.newContext({baseURL,viewport:{width:390,height:844}})
  const prefix=`e2e-ministry-management-${randomUUID().slice(0,8)}`
  let ministryId="",departmentId="",sourceId="",targetId="",volunteerCreated="",targetSchedule="",targetScheduleExisted=false
  try {
    const profiles=await sql<{id:string;company_id:string;person_id:string;email:string}[]>`select p.id,p.company_id,coalesce(person.id,p.person_id) person_id,p.email
      from public.profiles p left join public.people person on person.profile_id=p.id and person.company_id=p.company_id and person.deleted_at is null
      where lower(p.email)=any(${[accounts.accounts.admin.email.toLowerCase(),accounts.accounts.member.email.toLowerCase(),accounts.portalAccounts!.ministryLeader!.email.toLowerCase()]}) and p.active and p.deleted_at is null`
    const admin=profiles.find(p=>p.email.toLowerCase()===accounts.accounts.admin.email.toLowerCase())!
    const member=profiles.find(p=>p.email.toLowerCase()===accounts.accounts.member.email.toLowerCase())!
    const leader=profiles.find(p=>p.email.toLowerCase()===accounts.portalAccounts!.ministryLeader!.email.toLowerCase())!
    expect(member?.person_id).toBeTruthy();expect(leader?.person_id).toBeTruthy()
    expect(member.company_id).toBe(admin.company_id);expect(leader.company_id).toBe(admin.company_id)
    expect((await sql`select status from public.companies where id=${admin.company_id}`)[0].status).toBe("test")
    const [ministry]=await sql`insert into public.ministries(company_id,name,slug,created_by,updated_by)
      values(${admin.company_id},${prefix},${prefix},${admin.id},${admin.id}) returning id`;ministryId=ministry.id
    await sql`insert into public.ministry_memberships(company_id,ministry_id,person_id,role,status)
      values(${admin.company_id},${ministryId},${member.person_id},'member','active'),(${admin.company_id},${ministryId},${leader.person_id},'leader','active')`
    const [department]=await sql`insert into public.volunteer_departments(company_id,ministry_id,name,manager_profile_id,created_by,updated_by)
      values(${admin.company_id},${ministryId},${prefix},${admin.id},${admin.id},${admin.id}) returning id`;departmentId=department.id
    const [role]=await sql`insert into public.volunteer_department_roles(company_id,department_id,name) values(${admin.company_id},${departmentId},'Som') returning id`
    const events=await sql`insert into public.events(company_id,ministry_id,title,starts_at,ends_at,status,created_by,updated_by)
      values(${admin.company_id},${ministryId},'Escala origem E2E',now()-interval '1 day',now()-interval '23 hours','published',${admin.id},${admin.id}),
      (${admin.company_id},${ministryId},'Atividade destino E2E',now()+interval '2 months',now()+interval '2 months 1 hour','published',${admin.id},${admin.id}) returning id`
    sourceId=events[0].id;targetId=events[1].id
    targetScheduleExisted=(await sql`select s.id from public.volunteer_schedules s join public.events e on e.company_id=s.company_id where e.id=${targetId} and s.month=date_trunc('month',e.starts_at at time zone 'America/Sao_Paulo')::date`).length>0
    const [position]=await sql`insert into public.volunteer_event_positions(company_id,event_id,department_id,role_id,role_name,required_volunteers,instructions)
      values(${admin.company_id},${sourceId},${departmentId},${role.id},'Som',1,'Conferir equipamento') returning id`
    const [schedule]=await sql`insert into public.volunteer_schedules(company_id,month,created_by,updated_by)
      values(${admin.company_id},date_trunc('month',now())::date,${admin.id},${admin.id}) on conflict(company_id,month) do update set updated_by=public.volunteer_schedules.updated_by returning id`
    const [shift]=await sql`insert into public.volunteer_shifts(company_id,schedule_id,event_id,event_position_id,department_id,role_id,role_name,required_volunteers,starts_at,ends_at,checkin_opens_at,checkin_closes_at)
      values(${admin.company_id},${schedule.id},${sourceId},${position.id},${departmentId},${role.id},'Som',1,now()-interval '1 day',now()-interval '23 hours',now()-interval '25 hours',now()-interval '22 hours') returning id`
    let [volunteer]=await sql`select id from public.volunteer_profiles where company_id=${admin.company_id} and person_id=${member.person_id} and deleted_at is null and registration_status='active'`
    if(!volunteer) { [volunteer]=await sql`insert into public.volunteer_profiles(company_id,person_id,registration_status,created_by,updated_by) values(${admin.company_id},${member.person_id},'active',${admin.id},${admin.id}) returning id`;volunteerCreated=volunteer.id }
    await sql`insert into public.volunteer_assignments(company_id,shift_id,volunteer_id,status,created_by,updated_by) values(${admin.company_id},${shift.id},${volunteer.id},'confirmed',${admin.id},${admin.id})`
    await authenticate(adminContext,accounts.accounts.admin,baseURL!)
    const page=await adminContext.newPage();const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message))
    await page.goto(`/ministerios/${ministryId}`)
    await expect(page.getByText("Precisa da sua atenção",{exact:true})).toBeVisible()
    await expect(page.getByText("Presença ainda não registrada.",{exact:true})).toBeVisible()
    await page.getByRole("button",{name:"Montar escala",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();await page.getByRole("dialog").getByRole("button",{name:"Cancelar",exact:true}).click()
    await page.getByRole("button",{name:"Copiar escala anterior",exact:true}).click();await page.getByLabel("Escala de origem").selectOption(sourceId);await page.getByLabel("Atividade de destino").selectOption(targetId)
    await page.getByRole("button",{name:"Copiar para rascunho",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0)
    expect((await sql`select a.status from public.volunteer_assignments a join public.volunteer_shifts s on s.id=a.shift_id where s.event_id=${targetId}`)[0]?.status).toBe("proposed")
    targetSchedule=(await sql`select schedule_id from public.volunteer_shifts where event_id=${targetId}`)[0].schedule_id
    expect((await sql`select volunteer_schedule_published_at from public.events where id=${targetId}`)[0].volunteer_schedule_published_at).toBeNull()
    await page.getByRole("button",{name:"Publicar escala",exact:true}).click();
    await expect.poll(async()=>Boolean((await sql`select volunteer_schedule_published_at from public.events where id=${targetId}`)[0].volunteer_schedule_published_at)).toBe(true)
    await page.getByRole("tab",{name:"Acompanhamentos",exact:true}).click();await page.getByRole("button",{name:"Novo acompanhamento",exact:true}).click()
    await page.getByLabel("Pessoa",{exact:true}).selectOption(member.person_id);await page.getByLabel("Título",{exact:true}).fill("Contato E2E do ministério");await page.getByLabel("Próxima ação",{exact:true}).fill("Agendar encontro");await page.getByLabel("Prazo",{exact:true}).fill("2026-10-10T18:00")
    await page.getByRole("button",{name:"Salvar acompanhamento",exact:true}).click();await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.getByRole("button",{name:"Iniciar",exact:true}).click();await expect(page.getByRole("button",{name:"Iniciar",exact:true})).toHaveCount(0)
    await page.getByRole("button",{name:"Concluir",exact:true}).click();await expect(page.getByRole("button",{name:"Reabrir",exact:true})).toBeVisible()
    await page.getByRole("tab",{name:"Relatórios",exact:true}).click();await page.getByLabel("De",{exact:true}).fill("2026-10-01");await page.getByLabel("Até",{exact:true}).fill("2026-10-31")
    await expect(page.getByRole("button",{name:"CSV",exact:true})).toBeEnabled()
    const exported=await page.request.get(`/api/ministerios/${ministryId}/export?format=csv&from=2026-10-01&to=2026-10-31`)
    expect(exported.status()).toBe(200);expect(await exported.text()).toContain("2026-10-01 a 2026-10-31")
    await authenticate(leaderContext,accounts.portalAccounts!.ministryLeader!,baseURL!)
    const leaderPage=await leaderContext.newPage();await leaderPage.goto(`/membro/ministerios/${ministryId}?tab=acompanhamentos`)
    await expect(leaderPage.getByText("Contato E2E do ministério",{exact:true})).toBeVisible()
    expect((await leaderPage.request.get(`/api/ministerios/${ministryId}/export?format=csv&from=2026-10-01&to=2026-10-31`)).status()).toBe(200)
    expect(await leaderPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    expect(errors).toEqual([])
  } finally {
    if(ministryId) await sql`delete from public.person_follow_up_tasks where ministry_id=${ministryId}`
    if(sourceId || targetId) {await sql`delete from public.volunteer_shifts where event_id=any(${[sourceId,targetId].filter(Boolean)}::uuid[])`;await sql`delete from public.events where id=any(${[sourceId,targetId].filter(Boolean)}::uuid[])`}
    if(targetSchedule && !targetScheduleExisted) await sql`delete from public.volunteer_schedules s where s.id=${targetSchedule} and not exists(select 1 from public.volunteer_shifts shift where shift.schedule_id=s.id)`
    if(departmentId) await sql`delete from public.volunteer_departments where id=${departmentId}`
    if(volunteerCreated) await sql`delete from public.volunteer_profiles where id=${volunteerCreated}`
    if(ministryId) await sql`delete from public.ministries where id=${ministryId}`
    await Promise.all([adminContext.close(),leaderContext.close()]);await sql.end()
  }
})

test("chat abre a primeira não lida e uma mensagem fixada fora da página atual",async({browser,baseURL})=>{
  const accounts=readE2EAccounts()
  const options={max:1,prepare:false,max_pipeline:0,connection:{statement_timeout:15000}}
  const sql=postgres(process.env.POSTGRES_URL!,options)
  const context=await browser.newContext({baseURL,viewport:{width:390,height:844}})
  let ministryId=""
  try {
    const profiles=await sql<{id:string;company_id:string;person_id:string;email:string}[]>`select p.id,p.company_id,coalesce(person.id,p.person_id) person_id,p.email
      from public.profiles p left join public.people person on person.profile_id=p.id and person.company_id=p.company_id and person.deleted_at is null
      where lower(p.email)=any(${[accounts.accounts.admin.email.toLowerCase(),accounts.accounts.member.email.toLowerCase()]}) and p.active and p.deleted_at is null`
    const admin=profiles.find(p=>p.email.toLowerCase()===accounts.accounts.admin.email.toLowerCase())!
    const member=profiles.find(p=>p.email.toLowerCase()===accounts.accounts.member.email.toLowerCase())!
    expect(member.company_id).toBe(admin.company_id)
    expect((await sql`select status from public.companies where id=${admin.company_id}`)[0].status).toBe("test")
    const name=`e2e-ministry-navigation-${randomUUID().slice(0,8)}`
    const [ministry]=await sql`insert into public.ministries(company_id,name,slug,created_by,updated_by)
      values(${admin.company_id},${name},${name},${admin.id},${admin.id}) returning id`;ministryId=ministry.id
    await sql`insert into public.ministry_memberships(company_id,ministry_id,person_id,role,status)
      values(${admin.company_id},${ministryId},${member.person_id},'member','active')`
    await sql`insert into public.ministry_chat_reads(company_id,ministry_id,profile_id,push_enabled)
      values(${admin.company_id},${ministryId},${member.id},false)`
    await sql`insert into public.ministry_chat_messages(company_id,ministry_id,sender_profile_id,client_id,body,created_at,pinned_at)
      select ${admin.company_id},${ministryId},${admin.id},gen_random_uuid(),'Histórico navegação '||i::text,
        now()-make_interval(mins=>61-i),case when i=1 then now() else null end from generate_series(1,60) i`
    await authenticate(context,accounts.accounts.member,baseURL!)
    const page=await context.newPage()
    await page.goto(`/membro/chats?ministry=${ministryId}`)
    await page.getByRole("button",{name:"Ir à primeira mensagem não lida",exact:true}).click()
    await expect(page.getByRole("log").getByText("Histórico navegação 1",{exact:true})).toBeInViewport()
    await page.reload()
    await page.getByLabel("Mensagens fixadas").getByRole("button",{name:/Abrir mensagem fixada/}).click()
    await expect(page.getByRole("log").getByText("Histórico navegação 1",{exact:true})).toBeInViewport()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  } finally {
    if(ministryId) await sql`delete from public.ministries where id=${ministryId}`
    await context.close();await sql.end()
  }
})
