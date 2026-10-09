// Controlled browser pilot: all mutations are confined to the configured test church.
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import ts from 'typescript'
import postgres from 'postgres'
import { chromium, expect } from '@playwright/test'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
Error.stackTraceLimit=0
const source=ts.transpileModule(await readFile('tests/e2e/helpers/accounts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {readE2EAccounts}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const accounts=readE2EAccounts(resolve('docs/testing/e2e-accounts.local.md'))
const baseURL=process.env.EVENTS_PILOT_BASE_URL || 'http://localhost:3147'
const sql=postgres(process.env.POSTGRES_URL,{max:1,prepare:false,max_pipeline:1,connect_timeout:10})
const prefix=`e2e-public-polish-${Date.now()}`
const output=resolve('artifacts/events-public-polish')
let browser,company,originalTypes
try {
 const [tenant]=await sql`select id,status,active from companies where legacy_id=${accounts.companyLegacyId}`
 assert.equal(tenant.status,'test');assert.equal(tenant.active,true);company=tenant.id
 assert.equal((await sql`select count(*)::int n from automation_flows where company_id=${company} and status='active'`)[0].n,0)
 originalTypes=(await sql`select event_types from church_profiles where company_id=${company}`)[0].event_types
 browser=await chromium.launch({headless:true});await mkdir(output,{recursive:true})
 const context=await browser.newContext({baseURL,viewport:{width:1440,height:1000}})
 const client=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:baseURL,sameSite:'Lax'})))}})
 const login=await client.auth.signInWithPassword({email:accounts.accounts.admin.email,password:accounts.accounts.admin.password});assert.equal(login.error,null,'Authentication')
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/eventos/novo');await page.getByLabel('Título *',{exact:true}).fill(prefix+' Conferência Esperança')
 await page.getByLabel('Descrição',{exact:true}).fill('Um encontro para renovar a fé, fortalecer amizades e viver momentos especiais em comunidade. Louvor, mensagens e comunhão para toda a família.')
 await page.getByText('Gerenciar tipos',{exact:true}).click();await page.getByLabel('Novo tipo de evento').fill(prefix+' Conferência');await page.getByRole('button',{name:'Adicionar tipo',exact:true}).click()
 await expect(page.locator('input[name="type"]')).toHaveValue(prefix+' Conferência')
 // 20 MiB valid PNG with trailing padding tests the exact upper boundary through signed Storage upload.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')
 const large=Buffer.alloc(20*1024*1024);png.copy(large)
 await page.getByLabel('Capa do evento',{exact:true}).setInputFiles({name:prefix+'.png',mimeType:'image/png',buffer:large})
 await expect(page.getByAltText('Prévia da capa do evento')).toBeVisible()
 await expect(page.getByRole('status').filter({hasText:'Enviando e validando capa'})).toHaveCount(0,{timeout:120000})
 await expect(page.locator('input[name="coverFileId"]')).not.toHaveValue('')
 await page.getByRole('button',{name:'Continuar',exact:true}).click()
 const start=new Date(Date.now()+86400000); const local=d=>new Date(d.getTime()-3*3600000).toISOString().slice(0,16)
 await page.getByLabel('Início *',{exact:true}).fill(local(start));await page.getByLabel('Fim',{exact:true}).fill(local(new Date(start.getTime()+3*3600000)))
 await page.getByLabel('Local',{exact:true}).fill('Auditório principal · Rua das Flores, 120 · São Paulo')
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByRole('button',{name:'Criar rascunho',exact:true}).click();await expect(page).toHaveURL(/\/eventos\/e2e-public-polish-/, {timeout:60000})
 await expect(page.getByText('Publique o evento para ativar o link público de divulgação.')).toBeVisible();assert.equal(await page.getByRole('button',{name:'Abrir público'}).count(),0)
 await page.getByRole('button',{name:'Ações de '+prefix+' Conferência Esperança',exact:true}).click();await page.getByRole('menuitem',{name:'Publicar',exact:true}).click()
 await expect(page.getByRole('button',{name:'Abrir público',exact:true})).toBeVisible({timeout:60000})
 const path=await page.getByRole('button',{name:'Abrir público',exact:true}).getAttribute('href');assert.ok(path.includes('/eventos/publico/'))
 const publicContext=await browser.newContext({baseURL,viewport:{width:1440,height:1000}});const publicPage=await publicContext.newPage();publicPage.on('pageerror',e=>errors.push(e.message))
 const response=await publicPage.goto(path);assert.equal(response.status(),200)
 await expect(publicPage.getByRole('heading',{name:prefix+' Conferência Esperança',exact:true})).toBeVisible()
 await expect(publicPage.getByRole('heading',{name:'Inscreva-se',exact:true})).toBeVisible()
 for(const width of [320,390,768,1440]) {await publicPage.setViewportSize({width,height:900});assert.equal(await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`No overflow at ${width}px`)}
 await publicPage.screenshot({path:resolve(output,'public-desktop.png'),fullPage:true})
 await publicPage.setViewportSize({width:390,height:844});await publicPage.getByRole('link',{name:'Quero participar',exact:true}).click();await expect(publicPage.getByLabel('Nome completo')).toBeInViewport()
 await publicPage.screenshot({path:resolve(output,'public-mobile.png'),fullPage:true})
 await publicPage.getByRole('button',{name:'Alternar tema',exact:true}).click();assert.equal(await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await publicPage.screenshot({path:resolve(output,'public-mobile-alternate-theme.png'),fullPage:true})
 // Direct publication at creation must activate the public link immediately.
 await page.goto('/eventos/novo');await page.getByLabel('Título *',{exact:true}).fill(prefix+' publicação direta')
 await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByLabel('Início *',{exact:true}).fill(local(start));await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click()
 await page.getByRole('combobox',{name:'Publicação',exact:true}).click();await page.getByRole('option',{name:'Criar e publicar agora',exact:true}).click();await page.getByRole('button',{name:'Criar e publicar',exact:true}).click();await expect(page).toHaveURL(/\/eventos\/e2e-public-polish-/, {timeout:60000})
 await expect(page.getByRole('button',{name:'Abrir público',exact:true})).toBeVisible();const directPath=await page.getByRole('button',{name:'Abrir público',exact:true}).getAttribute('href');assert.equal((await publicPage.goto(directPath)).status(),200)
 await page.goto('/eventos/'+(await sql`select slug from events where company_id=${company} and title=${prefix+' Conferência Esperança'}`)[0].slug)
 // Removal preserves the event type, including when returning to edit a historical choice.
 await page.getByRole('button',{name:'Editar evento',exact:true}).click();await page.getByText('Gerenciar tipos',{exact:true}).click();await page.getByRole('button',{name:'Excluir tipo '+prefix+' Conferência',exact:true}).click()
 await expect(page.getByText('Tipo removido das opções. Eventos existentes foram preservados.')).toBeVisible()
 await page.reload();await page.getByRole('button',{name:'Editar evento',exact:true}).click();await expect(page.locator('input[name="type"]')).toHaveValue(prefix+' Conferência')
 assert.deepEqual(errors,[])
 console.log('PASS: exact 20 MiB signed upload and preview, persistent church types/add/delete/history, draft prevents broken public link, publication yields HTTP 200, direct create/publish, light/dark public layout 320/390/768/1440px, registration CTA, no browser errors')
} finally {
 await browser?.close()
 if(company) {
  const events=await sql`select id from events where company_id=${company} and title like ${prefix+'%'}`;const ids=events.map(row=>row.id)
  const files=await sql`select id,bucket,storage_path from app_files where company_id=${company} and original_name=${prefix+'.png'}`
  const storage=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
  for(const file of files) assert.equal((await storage.storage.from(file.bucket).remove([file.storage_path])).error,null)
  await sql.begin(async tx=>{
   if(ids.length){await tx`delete from notification_inbox where company_id=${company} and (source_id=any(${ids}::uuid[]) or scope_id=any(${ids}::uuid[]))`;await tx`delete from notifications where company_id=${company} and event_id=any(${ids}::uuid[])`;await tx`delete from events where company_id=${company} and id=any(${ids}::uuid[])`;await tx`delete from audit_logs where company_id=${company} and entity_id::text=any(${ids}::text[])`;await tx`delete from route_private.slug_reservations where company_id=${company} and entity_id=any(${ids}::uuid[]) and slug like ${prefix+'%'}`}
   if(files.length) await tx`delete from app_files where company_id=${company} and id=any(${files.map(row=>row.id)}::uuid[])`
   if(originalTypes) await tx`update church_profiles set event_types=${originalTypes}::text[] where company_id=${company}`
  })
  console.log('CLEANUP: synthetic event, files, catalog changes and related audit removed')
 }
 await sql.end()
}
