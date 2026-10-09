// Real authenticated pilot. Synthetic data is restricted to the configured test church.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import postgres from "postgres"
import { createClient } from "@supabase/supabase-js"
import ts from "typescript"
import { chromium, expect } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"
const baseURL = process.env.EVENTS_PILOT_BASE_URL || "http://localhost:3139"
const docPath = resolve("docs/testing/e2e-accounts.local.md")
const source = ts.transpileModule(await readFile("tests/e2e/helpers/accounts.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const { readE2EAccounts } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)
const accounts = readE2EAccounts(docPath)
const sql=postgres(process.env.POSTGRES_URL,{max:1,prepare:false,max_pipeline:1,connect_timeout:10,connection:{statement_timeout:20000}})
const prefix=`e2e-events-${randomUUID().slice(0,8)}`
const ids={department:randomUUID(),role:randomUUID(),membership:randomUUID()}
let browser,company,eventId
let originalSchedules=[]
const contexts=[]
const failures=[]
const output=resolve("test-results/events-professional-pilot")
async function authenticate(account,viewport,dark=false){
 const context=await browser.newContext({baseURL,viewport,colorScheme:dark?"dark":"light"});contexts.push(context)
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:"Lax"})))}})
 const result=await client.auth.signInWithPassword({email:account.email,password:account.password});assert.equal(result.error?.code||null,null,"Autenticação do piloto")
 await context.addInitScript(dark=>localStorage.setItem("theme",dark?"dark":"light"),dark)
 const page=await context.newPage();page.on("pageerror",error=>failures.push(error.message));return page
}
function dateInput(date){const pad=value=>String(value).padStart(2,"0");return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,"Tela sem rolagem horizontal")}
try{
 const [tenant]=await sql`select id,status,active from public.companies where legacy_id=${accounts.companyLegacyId}`;assert.equal(tenant?.status,"test");assert.equal(tenant.active,true);company=tenant.id
 assert.equal((await sql`select count(*)::int n from public.automation_flows where company_id=${company} and status='active'`)[0].n,0,"Sem automações ativas no piloto")
 const [volunteer]=await sql`select vp.id,person.id person_id,profile.id profile_id from public.volunteer_profiles vp join public.people person on person.id=vp.person_id and person.company_id=vp.company_id join public.profiles profile on profile.id=person.profile_id where vp.company_id=${company} and vp.registration_status='active' and profile.email=${accounts.portalAccounts.volunteer.email} and vp.deleted_at is null`
 assert.ok(volunteer,"Voluntário fictício ativo")
 originalSchedules=(await sql`select id from public.volunteer_schedules where company_id=${company}`).map(row=>row.id)
 await sql`insert into public.volunteer_departments(id,company_id,name,is_active) values(${ids.department},${company},${prefix+' Recepção'},true)`
 await sql`insert into public.volunteer_department_roles(id,company_id,department_id,name,is_active) values(${ids.role},${company},${ids.department},${prefix+' Conferente'},true)`
 await sql`insert into public.volunteer_department_memberships(id,company_id,department_id,volunteer_id,role_id,role_name,is_active) values(${ids.membership},${company},${ids.department},${volunteer.id},${ids.role},${prefix+' Conferente'},true)`
 await sql`insert into public.events(company_id,title,starts_at,ends_at,status,registration_enabled,is_public) select ${company},${prefix+' histórico '}||n,now()+interval '10 days'+n*interval '1 minute',now()+interval '10 days 3 hours'+n*interval '1 minute','draft',false,false from generate_series(1,501) n`
 browser=await chromium.launch({headless:true});await mkdir(output,{recursive:true})
 const admin=await authenticate(accounts.accounts.admin,{width:1440,height:1000})
 const member=await authenticate(accounts.portalAccounts.volunteer,{width:390,height:844},true)
 const publicContext=await browser.newContext({baseURL,viewport:{width:390,height:844},extraHTTPHeaders:{"x-vercel-forwarded-for":"127.0.0.1"}});contexts.push(publicContext)
 const guest=await publicContext.newPage();guest.on("pageerror",error=>failures.push(error.message))
 await admin.goto(`/eventos?query=${prefix}`);await expect(admin.getByRole("button",{name:"Novo evento",exact:true})).toBeVisible();await expect(admin.getByText("Próxima",{exact:true})).toBeVisible();assert.equal(await admin.locator('form input[name="title"]').count(),0)
 await admin.getByRole("button",{name:"Grade",exact:true}).click();await admin.reload();assert.equal(await admin.evaluate(()=>localStorage.getItem("events-view")),"grid")
 await admin.goto(`/eventos?query=${prefix+' histórico 1'}&page=2`);await expect(admin.getByRole("main").getByText("Página 2",{exact:false})).toBeVisible()
 await admin.goto("/eventos/novo");await admin.getByLabel("Título *",{exact:true}).fill(prefix+' encontro')
 await admin.getByLabel("Descrição",{exact:true}).fill("Evento fictício para validar inscrição, escala e entrada.")
 await admin.getByLabel("Capa do evento",{exact:true}).setInputFiles({name:prefix+".png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64")});await expect(admin.getByText(prefix+".png",{exact:false})).toBeVisible()
 await admin.getByRole("button",{name:"Continuar",exact:true}).click()
 const start=new Date(Date.now()+3600000),end=new Date(start.getTime()+3*3600000)
 await admin.getByLabel("Início *",{exact:true}).fill(dateInput(start));await admin.getByLabel("Fim",{exact:true}).fill(dateInput(end));await admin.getByLabel("Local",{exact:true}).fill("Sala de teste")
 await admin.getByRole("button",{name:"Continuar",exact:true}).click()
 await admin.getByLabel("Capacidade",{exact:true}).fill("2")
 await admin.getByRole("combobox",{name:"Valor do evento",exact:true}).click();await admin.getByRole("option",{name:"Valor informado",exact:true}).click()
 await admin.getByLabel("Valor em reais",{exact:true}).fill("150,50");await admin.getByLabel("Orientações sobre o valor",{exact:true}).fill("Valor informativo de teste. Sem cobrança.")
 await admin.getByRole("button",{name:"Continuar",exact:true}).click();await expect(admin.getByText("R$ 150,50",{exact:true})).toBeVisible()
 await admin.getByRole("button",{name:"Criar rascunho",exact:true}).click();await expect(admin).toHaveURL(/\/eventos\/e2e-events-/)
 const [event]=await sql`select id,slug,public_slug,value_cents,status,allow_walk_ins,cover_file_id from public.events where company_id=${company} and title=${prefix+' encontro'}`;assert.equal(event.value_cents,15050);assert.equal(event.status,"draft");assert.equal(event.allow_walk_ins,false);eventId=event.id;assert.ok(event.cover_file_id)
 await admin.getByRole("button",{name:"Equipe e escala",exact:true}).click();await admin.getByRole("button",{name:"Adicionar função",exact:true}).click()
 await admin.getByLabel("Equipe",{exact:true}).selectOption(ids.department);await admin.getByLabel("Função",{exact:true}).selectOption(ids.role);await admin.getByLabel("Instruções",{exact:true}).fill("Conferir QR na recepção")
 await admin.getByRole("button",{name:"Salvar equipe",exact:true}).click();await expect(admin.getByText("Equipe salva",{exact:true})).toBeVisible()
 await admin.getByRole("button",{name:"Gerar rascunho da escala",exact:true}).click();await expect(admin.getByText("Rascunho da escala gerado",{exact:true})).toBeVisible()
 const [shift]=await sql`select id,schedule_id from public.volunteer_shifts where event_id=${eventId} and company_id=${company}`;assert.ok(shift)
 // Assignment uses the same authenticated API as Voluntariado.
 const assigned=await admin.request.post("/api/v1/volunteers/assignments",{data:{shiftId:shift.id,volunteerId:volunteer.id,status:"proposed"}});assert.equal(assigned.status(),201,await assigned.text())
 await admin.getByRole("button",{name:`Ações de ${prefix+' encontro'}`,exact:true}).click();await admin.getByRole("menuitem",{name:"Publicar",exact:true}).click();await expect(admin.getByText("Evento publicado",{exact:true})).toBeVisible()
 await admin.getByRole("button",{name:"Publicar escala",exact:true}).click();await expect(admin.getByText("Escala publicada",{exact:true})).toBeVisible()
 assert.ok((await sql`select volunteer_schedule_published_at from public.events where id=${eventId}`)[0].volunteer_schedule_published_at)
 await member.goto(`/membro/eventos/${eventId}`);await member.getByRole("button",{name:"Inscrever-me",exact:true}).click();await expect(member.getByText("Inscrição confirmada",{exact:true})).toBeVisible();await expect(member.locator("svg").last()).toBeVisible();await noOverflow(member)
 const [church]=await sql`select slug from public.companies where id=${company}`
 await guest.goto(`/eventos/publico/${church.slug}/${event.public_slug}`);await expect(guest.getByText("R$ 150,50",{exact:true})).toBeVisible()
 await expect(guest.locator("img")).toBeVisible();assert.ok(await guest.locator("img").evaluate(img=>img.complete&&img.naturalWidth>0));
 await guest.getByLabel("Nome completo",{exact:true}).fill(prefix+' visitante');await guest.getByLabel("Telefone",{exact:true}).fill("11900000000");await guest.getByRole("checkbox").check();await guest.getByRole("button",{name:"Confirmar inscrição",exact:true}).click();await expect(guest.getByText("Inscrição confirmada",{exact:true})).toBeVisible()
 const [registeredGuest]=await sql`select id,confirmation_token from public.event_guest_registrations where company_id=${company} and event_id=${eventId}`
 await guest.goto(`/eventos/inscricao/${registeredGuest.confirmation_token}`);await expect(guest.getByText("Apresente seu QR na recepção do evento.",{exact:true})).toBeVisible();await guest.screenshot({path:resolve(output,"receipt-mobile.png")});await noOverflow(guest)
 await admin.reload();await admin.getByRole("button",{name:"Check-in",exact:true}).click();await admin.getByRole("button",{name:"Abrir check-in",exact:true}).click();await expect(admin.getByRole("button",{name:"Encerrar check-in",exact:true})).toBeVisible();await admin.reload();await admin.getByRole("button",{name:"Check-in",exact:true}).click();await expect(admin.getByRole("button",{name:"Encerrar check-in",exact:true})).toBeVisible()
 const tokens=await sql`select token,member_rsvp_id,guest_registration_id from public.event_attendee_tokens where company_id=${company} and event_id=${eventId}`
 for(const token of tokens){await admin.getByLabel("Link ou código do participante").fill(`${baseURL}/eventos/check-in/${token.token}`);await admin.getByRole("button",{name:"Conferir",exact:true}).click();await expect(admin.getByRole("status").filter({hasText:"Entrada confirmada:"})).toBeVisible()}
 await expect.poll(async()=>Number((await sql`select count(*)::int n from public.attendance_records where company_id=${company} and event_ref_id=${eventId}`)[0].n)).toBe(2)
 const before=(await sql`select id,checkin_at from public.attendance_records where company_id=${company} and event_ref_id=${eventId} order by id`)
 await admin.getByRole("button",{name:"Conferir",exact:true}).click();await expect(admin.getByRole("status").filter({hasText:"Presença já registrada:"})).toBeVisible();assert.deepEqual(await sql`select id,checkin_at from public.attendance_records where company_id=${company} and event_ref_id=${eventId} order by id`,before)
 await admin.getByRole("button",{name:"Ler QR pela câmera",exact:true}).click();await expect(admin.getByText("Não foi possível acessar a câmera.",{exact:false})).toBeVisible()
 const [session]=await sql`select token from public.event_checkin_sessions where company_id=${company} and event_id=${eventId} and closed_at is null order by opens_at desc limit 1`
 await guest.goto(`/eventos/check-in/sessao/${session.token}`);await guest.getByLabel('Nome completo',{exact:true}).fill(prefix+' visitante');await guest.getByLabel('Telefone',{exact:true}).fill('11900000000');await guest.getByRole('checkbox').check();await guest.getByRole('button',{name:'Confirmar presença',exact:true}).click();await expect(guest.getByText('Presença registrada',{exact:true})).toBeVisible();assert.deepEqual(await sql`select id,checkin_at from public.attendance_records where company_id=${company} and event_ref_id=${eventId} order by id`,before)
 await admin.getByRole('button',{name:'Encerrar check-in',exact:true}).click();await expect(admin.getByRole('button',{name:'Abrir check-in',exact:true})).toBeVisible();await guest.reload();await expect(guest.getByText('Sessão inválida, expirada ou encerrada.',{exact:false})).toBeVisible();await guest.goto(`/eventos/inscricao/${registeredGuest.confirmation_token}`)
 await admin.getByRole("button",{name:"Relatórios",exact:true}).click();await expect(admin.getByText("Indicadores do evento",{exact:true})).toBeVisible();assert.equal(before.length,2)
 await admin.screenshot({path:resolve(output,"report-desktop.png")})
 await member.goto(`/membro/agenda?event=${eventId}`);await expect(member.getByRole("dialog").getByText(prefix+' Conferente',{exact:false})).toBeVisible()
 await admin.goto(`/eventos?query=${prefix+' encontro'}`);await admin.getByRole("button",{name:"Grade",exact:true}).click();await admin.screenshot({path:resolve(output,"events-grid-desktop.png")})
 await admin.setViewportSize({width:390,height:844});await admin.reload();await expect(admin.getByRole("main").getByText(prefix+' encontro',{exact:true})).toBeVisible();if(!await admin.locator('html').evaluate(html=>html.classList.contains('dark')))await admin.getByRole("button",{name:"Alternar tema",exact:true}).click();await expect(admin.locator('html')).toHaveClass(/dark/);await noOverflow(admin);await admin.screenshot({path:resolve(output,"events-grid-mobile-dark.png")})
 const exportResult=await admin.request.get(`/api/v1/events/${eventId}/participants/export?query=${encodeURIComponent(prefix+' visitante')}`);assert.equal(exportResult.status(),200)
 await admin.goto(`/eventos/${event.slug}`);await admin.getByRole('button',{name:'Inscrições',exact:true}).click();await admin.getByRole('button',{name:'Adicionar participante',exact:true}).click();await admin.getByLabel('Nome completo',{exact:true}).fill(prefix+' recepção');await admin.getByLabel('Telefone',{exact:true}).fill('11911111111');await admin.getByRole('checkbox').check();await admin.getByRole('button',{name:'Salvar inscrição',exact:true}).click();await expect.poll(async()=> (await sql`select status from public.event_guest_registrations where company_id=${company} and event_id=${eventId} and full_name=${prefix+' recepção'}`)[0]?.status).toBe('waitlisted')
 await guest.getByRole('button',{name:'Cancelar inscrição',exact:true}).click();await expect.poll(async()=> (await sql`select status from public.event_guest_registrations where company_id=${company} and event_id=${eventId} and full_name=${prefix+' recepção'}`)[0]?.status).toBe('going');assert.equal((await sql`select count(*)::int n from public.event_attendee_tokens token join public.event_guest_registrations participant on participant.id=token.guest_registration_id where participant.company_id=${company} and participant.event_id=${eventId} and participant.full_name=${prefix+' recepção'}`)[0].n,1)
 await admin.setViewportSize({width:1440,height:1000});await admin.goto(`/eventos/${event.slug}`);await admin.getByRole("button",{name:`Ações de ${prefix+' encontro'}`,exact:true}).click();await admin.getByRole("menuitem",{name:"Duplicar",exact:true}).click();await expect(admin.getByRole('main').getByText(prefix+' encontro (cópia)',{exact:true})).toBeVisible()
 const [clone]=await sql`select id,slug,status,value_cents,cover_file_id from public.events where company_id=${company} and title=${prefix+' encontro (cópia)'}`;assert.equal(clone.status,'draft');assert.equal(clone.value_cents,15050);assert.equal(clone.cover_file_id,event.cover_file_id)
 await admin.getByRole('button',{name:'Editar evento',exact:true}).click();await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('checkbox',{name:'Evento online',exact:true}).check();await admin.getByLabel('Link online *',{exact:true}).fill('https://example.com/encontro');await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByLabel('Capacidade',{exact:true}).fill('1');await admin.getByLabel('Valor em reais',{exact:true}).fill('175,25');await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect.poll(async()=> (await sql`select value_cents from public.events where id=${clone.id}`)[0].value_cents).toBe(17525)
 const [edited]=await sql`select is_online,online_link from public.events where id=${clone.id}`;assert.equal(edited.is_online,true);assert.equal(edited.online_link,'https://example.com/encontro')
 await admin.goto(`/eventos/${clone.slug}`);await admin.getByRole('button',{name:`Ações de ${prefix+' encontro (cópia)'}`,exact:true}).click();await admin.getByRole('menuitem',{name:'Publicar',exact:true}).click();await expect.poll(async()=> (await sql`select status from public.events where id=${clone.id}`)[0].status).toBe('published')
 const [cloneRoute]=await sql`select public_slug from public.events where id=${clone.id}`
 await Promise.all([member.goto(`/membro/eventos/${clone.id}`),guest.goto(`/eventos/publico/${church.slug}/${cloneRoute.public_slug}`)])
 await guest.getByLabel('Nome completo',{exact:true}).fill(prefix+' disputa');await guest.getByLabel('Telefone',{exact:true}).fill('11922222222');await guest.getByRole('checkbox').check()
 await Promise.all([member.getByRole('button',{name:'Inscrever-me',exact:true}).click(),guest.getByRole('button',{name:'Confirmar inscrição',exact:true}).click()])
 const raceStates=async()=> (await sql`select status from public.member_event_rsvps where company_id=${company} and event_id=${clone.id} and status<>'canceled' union all select status from public.event_guest_registrations where company_id=${company} and event_id=${clone.id} and status<>'canceled'`).map(row=>row.status).sort()
 await expect.poll(raceStates).toEqual(['going','waitlisted'])
 await admin.reload();await admin.getByRole('button',{name:'Inscrições',exact:true}).click()
 const [winner]=await sql`select person.full_name as name from public.member_event_rsvps rsvp join public.people person on person.id=rsvp.person_id and person.company_id=rsvp.company_id where rsvp.company_id=${company} and rsvp.event_id=${clone.id} and rsvp.status='going' union all select full_name from public.event_guest_registrations where company_id=${company} and event_id=${clone.id} and status='going'`
 await admin.getByText(winner.name,{exact:true}).locator('..').locator('..').getByRole('button',{name:'Cancelar inscrição',exact:true}).click();await expect.poll(raceStates).toEqual(['going'])
 await admin.reload();await admin.getByRole('button',{name:'Inscrições',exact:true}).click();await admin.getByRole('button',{name:'Cancelar inscrição',exact:true}).click();await expect.poll(raceStates).toEqual([])
 await admin.goto(`/eventos/${clone.slug}`);await admin.getByRole('button',{name:`Ações de ${prefix+' encontro (cópia)'}`,exact:true}).click();await admin.getByRole('menuitem',{name:'Cancelar evento',exact:true}).click();await admin.getByRole('alertdialog').getByRole('button',{name:'Cancelar evento',exact:true}).click();await expect.poll(async()=> (await sql`select status from public.events where id=${clone.id}`)[0].status).toBe('cancelled')
 // External ticketing: real authenticated creation, editing, public/member links and scale reuse.
 await admin.goto('/eventos/novo');await admin.getByLabel('Título *',{exact:true}).fill(prefix+' externo')
 await admin.getByRole('button',{name:'Continuar',exact:true}).click()
 await admin.getByLabel('Início *',{exact:true}).fill(dateInput(start));await admin.getByLabel('Fim',{exact:true}).fill(dateInput(end));await admin.getByLabel('Local',{exact:true}).fill('Auditório externo')
 await admin.getByRole('button',{name:'Continuar',exact:true}).click()
 await admin.getByRole('combobox',{name:'Onde acontece a inscrição?',exact:true}).click();await admin.getByRole('option',{name:'Em plataforma externa',exact:true}).click()
 await admin.getByLabel('Link dos ingressos *',{exact:true}).fill('https://www.sympla.com.br/evento/teste-altar/123456')
 await admin.getByRole('button',{name:'Continuar',exact:true}).click();await expect(admin.getByText('Consulte os valores no Sympla',{exact:true})).toBeVisible()
 await admin.getByRole('button',{name:'Criar rascunho',exact:true}).click();await expect(admin).toHaveURL(/\/eventos\/e2e-events-/)
 const [external]=await sql`select * from public.events where company_id=${company} and title=${prefix+' externo'}`
 assert.equal(external.registration_mode,'external');assert.equal(external.registration_enabled,false);assert.equal(external.allow_walk_ins,false);assert.equal(external.value_cents,0)
 assert.equal(await admin.getByRole('link',{name:'Comprar ingressos no Sympla',exact:true}).count(),0)
 await admin.getByRole('button',{name:`Ações de ${prefix+' externo'}`,exact:true}).click();await admin.getByRole('menuitem',{name:'Publicar',exact:true}).click();await expect(admin.getByText('Evento publicado',{exact:true})).toBeVisible()
 await guest.goto(`/eventos/publico/${church.slug}/${external.public_slug}`)
 const ticket=guest.getByRole('link',{name:'Comprar ingressos no Sympla',exact:true});await expect(ticket).toHaveAttribute('href',external.external_ticket_url);await expect(ticket).toHaveAttribute('target','_blank');await expect(ticket).toHaveAttribute('rel','noopener noreferrer')
 await expect(guest.getByText('Consulte os valores no Sympla',{exact:true})).toBeVisible();assert.equal(await guest.getByRole('button',{name:'Confirmar inscrição',exact:true}).count(),0);await noOverflow(guest);await guest.screenshot({path:resolve(output,'external-mobile.png')})
 await member.goto(`/membro/eventos/${external.id}`);await expect(member.getByRole('link',{name:'Comprar ingressos no Sympla',exact:true})).toHaveAttribute('href',external.external_ticket_url);assert.equal(await member.getByRole('button',{name:'Inscrever-me',exact:true}).count(),0);await noOverflow(member)
 await admin.getByRole('button',{name:'Check-in',exact:true}).click();assert.equal(await admin.getByRole('button',{name:'Abrir check-in',exact:true}).count(),0)
 await admin.getByRole('button',{name:'Inscrições',exact:true}).click();assert.equal(await admin.getByRole('button',{name:'Adicionar participante',exact:true}).count(),0)
 await admin.getByRole('button',{name:'Equipe e escala',exact:true}).click();await admin.getByRole('button',{name:'Adicionar função',exact:true}).click()
 await admin.getByLabel('Equipe',{exact:true}).selectOption(ids.department);await admin.getByLabel('Função',{exact:true}).selectOption(ids.role);await admin.getByLabel('Instruções',{exact:true}).fill('Conferir ingresso pela plataforma externa')
 await admin.getByRole('button',{name:'Salvar equipe',exact:true}).click();await expect(admin.getByText('Equipe salva',{exact:true})).toBeVisible();await admin.getByRole('button',{name:'Gerar rascunho da escala',exact:true}).click();await expect(admin.getByText('Rascunho da escala gerado',{exact:true})).toBeVisible()
 const [externalShift]=await sql`select id from public.volunteer_shifts where company_id=${company} and event_id=${external.id}`
 const externalAssignment=await admin.request.post('/api/v1/volunteers/assignments',{data:{shiftId:externalShift.id,volunteerId:volunteer.id,status:'proposed'}});assert.equal(externalAssignment.status(),201,await externalAssignment.text())
 await admin.getByRole('button',{name:'Publicar escala',exact:true}).click();await expect(admin.getByText('Escala publicada',{exact:true})).toBeVisible()
 await member.goto(`/membro/agenda?event=${external.id}`);await expect(member.getByRole('dialog').getByText(prefix+' Conferente',{exact:false})).toBeVisible();await expect(member.getByRole('dialog').getByRole('link',{name:'Comprar ingressos no Sympla',exact:true})).toBeVisible()
 await admin.getByRole('button',{name:'Editar evento',exact:true}).click();await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('checkbox',{name:'Evento online',exact:true}).check();await admin.getByLabel('Link online *',{exact:true}).fill('https://example.com/transmissao');await admin.getByRole('button',{name:'Continuar',exact:true}).click()
 await admin.getByRole('combobox',{name:'Valor do evento',exact:true}).click();await admin.getByRole('option',{name:'Valor informado',exact:true}).click();await admin.getByLabel('Valor em reais',{exact:true}).fill('150,50');await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('button',{name:'Salvar alterações',exact:true}).click()
 await expect.poll(async()=> (await sql`select value_cents from public.events where id=${external.id}`)[0].value_cents).toBe(15050)
 const [externalEdited]=await sql`select online_link,external_ticket_url from public.events where id=${external.id}`;assert.equal(externalEdited.online_link,'https://example.com/transmissao');assert.equal(externalEdited.external_ticket_url,external.external_ticket_url)
 await guest.reload();await expect(guest.getByText('R$ 150,50',{exact:true})).toBeVisible()
 await admin.getByRole('button',{name:`Ações de ${prefix+' externo'}`,exact:true}).click();await admin.getByRole('menuitem',{name:'Duplicar',exact:true}).click();await expect(admin.getByRole('main').getByText(prefix+' externo (cópia)',{exact:true})).toBeVisible()
 const [externalClone]=await sql`select * from public.events where company_id=${company} and title=${prefix+' externo (cópia)'}`;assert.equal(externalClone.registration_mode,'external');assert.equal(externalClone.external_ticket_url,external.external_ticket_url);assert.equal(externalClone.value_cents,15050);assert.equal(externalClone.status,'draft')
 await admin.getByRole('button',{name:`Ações de ${prefix+' externo (cópia)'}`,exact:true}).click();await admin.getByRole('menuitem',{name:'Cancelar evento',exact:true}).click();await admin.getByRole('alertdialog').getByRole('button',{name:'Cancelar evento',exact:true}).click();await expect.poll(async()=> (await sql`select status from public.events where id=${externalClone.id}`)[0].status).toBe('cancelled');assert.equal(await admin.getByRole('link',{name:'Comprar ingressos no Sympla',exact:true}).count(),0)
 // A real save must report the database guard and leave active participants intact.
 await admin.goto(`/eventos/${event.slug}`);await admin.getByRole('button',{name:'Editar evento',exact:true}).click();await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('button',{name:'Continuar',exact:true}).click()
 await admin.getByRole('combobox',{name:'Onde acontece a inscrição?',exact:true}).click();await admin.getByRole('option',{name:'Em plataforma externa',exact:true}).click();await admin.getByLabel('Link dos ingressos *',{exact:true}).fill(external.external_ticket_url);await admin.getByRole('button',{name:'Continuar',exact:true}).click();await admin.getByRole('button',{name:'Salvar alterações',exact:true}).click();await expect(admin.getByText('Cancele as inscrições internas confirmadas e em espera antes de mudar para plataforma externa',{exact:true})).toBeVisible();assert.equal((await sql`select registration_mode from public.events where id=${eventId}`)[0].registration_mode,'internal')
 assert.deepEqual(failures,[])
 console.log('PASS: external create/publish/edit/duplicate/cancel, HTTPS links/mobile/member/agenda, price unknown/reference, separate transmission, local operations hidden, published scale and active-registration conversion guard')
 console.log("PASS: list/grid persistence, >500 events search/pagination, guided draft/value, event team/draft/publish, member and public registration/receipt, QR/repeat/reload/camera-denied, report/export, portal scale, desktop/mobile/light/dark, online edit/duplicate/cancel, simultaneous member/guest last-place race and promotion")
}catch(error){console.error("PILOT FAILED",error.message);if(browser){const page=contexts[0]?.pages()[0];await page?.screenshot({path:resolve(output,"failure.png")}).catch(()=>{})}throw error}
finally{
 for(const context of contexts)await context.close();await browser?.close()
 if(company){
  const events=await sql`select id from public.events where company_id=${company} and title like ${prefix+'%'}`;const eventIds=events.map(event=>event.id)
  const shifts=eventIds.length?await sql`select id,schedule_id from public.volunteer_shifts where company_id=${company} and event_id=any(${eventIds}::uuid[])`:[]
  const assignments=shifts.length?await sql`select id from public.volunteer_assignments where company_id=${company} and shift_id=any(${shifts.map(shift=>shift.id)}::uuid[])`:[]
  const files=await sql`select id,bucket,storage_path from public.app_files where company_id=${company} and original_name=${prefix+".png"} and entity_table='events'`;
  if(files.length){const storage=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});for(const file of files){const removed=await storage.storage.from(file.bucket).remove([file.storage_path]);assert.equal(removed.error,null)}}
  const scopeIds=[...files.map(file=>file.id),...eventIds,...shifts.map(shift=>shift.id),...assignments.map(assignment=>assignment.id),...Object.values(ids)]
  await sql.begin(async tx=>{
   if(eventIds.length){await tx`delete from public.notification_inbox where company_id=${company} and (source_id=any(${scopeIds}::uuid[]) or scope_id=any(${scopeIds}::uuid[]))`;await tx`delete from public.notifications where company_id=${company} and event_id=any(${eventIds}::uuid[])`;await tx`delete from public.attendance_records where company_id=${company} and event_ref_id=any(${eventIds}::uuid[])`;await tx`delete from public.volunteer_shifts where company_id=${company} and event_id=any(${eventIds}::uuid[])`;await tx`delete from public.events where company_id=${company} and id=any(${eventIds}::uuid[])`;await tx`delete from public.audit_logs where company_id=${company} and (entity_id::text=any(${scopeIds}::text[]) or metadata->>'eventId'=any(${eventIds}::text[]))`;await tx`delete from route_private.slug_reservations where company_id=${company} and entity_id=any(${eventIds}::uuid[]) and slug like ${prefix+'%'}`}
   if(files.length) await tx`delete from public.app_files where company_id=${company} and id=any(${files.map(file=>file.id)}::uuid[])`;
   await tx`delete from public.volunteer_department_memberships where id=${ids.membership} and company_id=${company}`;await tx`delete from public.volunteer_department_roles where id=${ids.role} and company_id=${company}`;await tx`delete from public.volunteer_departments where id=${ids.department} and company_id=${company}`
  })
  await sql`delete from public.volunteer_schedules where company_id=${company} and not(id=any(${originalSchedules}::uuid[])) and not exists(select 1 from public.volunteer_shifts where schedule_id=volunteer_schedules.id)`
  assert.equal((await sql`select count(*)::int n from public.events where company_id=${company} and title like ${prefix+'%'}`)[0].n,0);console.log("CLEANUP: synthetic events, participants, check-in, scale, department and audit removed")
 }
 await sql.end()
}
