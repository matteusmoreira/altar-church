import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import { expect, test, type BrowserContext } from "@playwright/test"
import { createServerClient } from "@supabase/ssr"
import postgres from "postgres"
import { readE2EAccounts, e2eRunPrefix, type E2EAccount } from "./helpers/accounts"

test.use({ trace: "off", video: "off", launchOptions: { args: ["--use-fake-device-for-media-stream"] } })
const accounts = readE2EAccounts()
const peer = accounts.portalAccounts?.volunteer

// Independent sessions avoid sharing refresh tokens with other running E2E specs.
async function authenticate(context: BrowserContext, account: E2EAccount, baseURL: string) {
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!, {
      cookies: {
        getAll: () => [],
        setAll: async cookies => {
          await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: baseURL,
            httpOnly: cookie.options.httpOnly ?? false, secure: baseURL.startsWith("https:"), sameSite: "Lax" as const })))
        },
      },
    })
  const result = await auth.auth.signInWithPassword({ email: account.email, password: account.password })
  expect(result.error?.code ?? null).toBeNull()
}
test("chat do ministério: duas sessões, moderação, anexos e perda de acesso", async ({ browser, baseURL }) => {
  test.setTimeout(180_000)
  test.skip(!process.env.POSTGRES_URL || !peer, "Contas/DB E2E não configurados")
  const sql = postgres(process.env.POSTGRES_URL!, { max: 1, prepare: false })
  const name = e2eRunPrefix("ministry-chat")
  const memberContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, permissions: [] })
  const peerContext = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
  const adminContext = await browser.newContext({ baseURL, viewport: { width: 1366, height: 900 } })
  let ministryId = "", otherId = ""
  let paths: string[] = []
  try {
    await authenticate(memberContext, accounts.accounts.member, baseURL!)
    await authenticate(peerContext, peer!, baseURL!)
    await authenticate(adminContext, accounts.accounts.admin, baseURL!)
    const profiles = await sql<{ id: string; company_id: string; person_id: string; role: string; email: string }[]>`
      select p.id,p.company_id,coalesce(person.id,p.person_id) person_id,p.role,p.email from public.profiles p
      left join public.people person on person.profile_id=p.id and person.company_id=p.company_id and person.deleted_at is null
      where lower(p.email)=any(${[accounts.accounts.member.email.toLowerCase(), peer!.email.toLowerCase(), accounts.accounts.admin.email.toLowerCase()]}) and p.active and p.deleted_at is null
    `
    const member = profiles.find(profile => profile.email.toLowerCase() === accounts.accounts.member.email.toLowerCase())!
    const otherMember = profiles.find(profile => profile.email.toLowerCase() === peer!.email.toLowerCase())!
    const admin = profiles.find(profile => profile.email.toLowerCase() === accounts.accounts.admin.email.toLowerCase())!
    expect(member?.person_id).toBeTruthy(); expect(otherMember?.person_id).toBeTruthy()
    expect(member.company_id).toBe(admin.company_id); expect(otherMember.company_id).toBe(admin.company_id)
    const ministries = await sql<{ id: string }[]>`insert into public.ministries(company_id,name,slug,created_by,updated_by)
      values (${admin.company_id},${name},${name},${admin.id},${admin.id}),(${admin.company_id},${`${name}-private`},${`${name}-private`},${admin.id},${admin.id}) returning id`
    ministryId = ministries[0].id; otherId = ministries[1].id
    await sql`insert into public.ministry_memberships(company_id,ministry_id,person_id,role,status)
      values(${admin.company_id},${ministryId},${member.person_id},'member','active'),(${admin.company_id},${ministryId},${otherMember.person_id},'member','active')`
    // UI tests never dispatch to existing devices.
    await sql`insert into public.ministry_chat_reads(company_id,ministry_id,profile_id,push_enabled)
      values(${admin.company_id},${ministryId},${member.id},false),(${admin.company_id},${ministryId},${otherMember.id},false)`
    const a = await memberContext.newPage(), b = await peerContext.newPage(), manager = await adminContext.newPage()
    const failures: string[] = []
    for (const page of [a,b,manager]) page.on("pageerror", error => failures.push(error.message))
    await a.goto(`/membro/chats?ministry=${ministryId}`)
    await b.goto(`/membro/chats?ministry=${ministryId}`)
    await expect(a.getByRole("heading", { name, exact: true })).toBeVisible()
    await expect(a.getByRole("button", { name: "Gravar áudio", exact: true })).toBeVisible()
    expect((await a.request.get(`/api/v1/ministries/${otherId}/chat`)).status()).toBe(403)
    await a.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Olá da primeira sessão")
    await a.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(b.getByRole("log").getByText("Olá da primeira sessão", { exact: true })).toBeVisible()
    await b.getByRole("button", { name: "Responder mensagem", exact: true }).first().click()
    await b.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Resposta da segunda sessão")
    await b.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(a.getByRole("log").getByText("Resposta da segunda sessão", { exact: true })).toBeVisible()
    await b.getByRole("button", { name: "Reagir com 🙏", exact: true }).first().click()
    await expect(b.getByRole("button", { name: "Reagir com 🙏", exact: true }).first()).toHaveAttribute("aria-pressed", "true")
    await peerContext.setOffline(true)
    await a.getByRole("button", { name: "Editar mensagem", exact: true }).first().click()
    await a.getByRole("textbox", { name: "Texto da mensagem", exact: true }).fill("Texto atualizado")
    await a.getByRole("button", { name: "Salvar", exact: true }).click()
    await peerContext.setOffline(false)
    await expect(b.getByRole("log").getByText("Texto atualizado", { exact: true }).first()).toBeVisible({ timeout: 25_000 })
    // Real Supabase signed upload and authenticated streamed download.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1sAAAAASUVORK5CYII=", "base64")
    await a.locator('input[type="file"]').setInputFiles({ name: "teste-chat.png", mimeType: "image/png", buffer: png })
    await a.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(a.getByRole("log").getByRole("img", { name: "teste-chat.png", exact: true })).toBeVisible()
    const data = (await (await a.request.get(`/api/v1/ministries/${ministryId}/chat`)).json()).data
    const attachment = data.messages.find((message: { attachments: unknown[] }) => message.attachments.length).attachments[0]
    expect((await a.request.get(attachment.url)).status()).toBe(200)
    await memberContext.grantPermissions(["microphone"])
    await a.getByRole("button", { name: "Gravar áudio", exact: true }).click()
    await expect(a.getByRole("status").filter({ hasText: "Gravando" })).toBeVisible()
    await expect(a.getByRole("status").filter({ hasText: /Gravando · [1-9]/ })).toBeVisible()
    await a.getByRole("button", { name: "Concluir", exact: true }).click()
    await expect(a.locator("form audio")).toBeVisible()
    await a.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(a.getByRole("log").locator("audio")).toBeVisible()
    const permissionSession = await memberContext.newCDPSession(a)
    const { targetInfo } = await permissionSession.send("Target.getTargetInfo")
    await permissionSession.send("Browser.setPermission", { permission: { name: "microphone" }, setting: "denied", origin: new URL(baseURL!).origin, browserContextId: targetInfo.browserContextId })
    await a.getByRole("button", { name: "Gravar áudio", exact: true }).click()
    await expect(a.getByText("Não foi possível acessar o microfone. Permita o acesso nas configurações do navegador", { exact: true })).toBeVisible()
    await permissionSession.send("Browser.setPermission", { permission: { name: "notifications" }, setting: "denied", origin: new URL(baseURL!).origin, browserContextId: targetInfo.browserContextId })
    await a.getByRole("button", { name: "Notificações", exact: true }).click()
    await a.getByRole("button", { name: "Ativar notificações push", exact: true }).click()
    await expect(a.getByText("O navegador bloqueou os avisos. Permita notificações nas configurações deste site e tente novamente.", { exact: true })).toBeVisible()
    await a.getByRole("button", { name: "Notificações", exact: true }).click()
    await manager.goto(`/ministerios/${name}`)
    const chatTab = manager.getByRole("tab", { name: /^Chat/ })
    await expect(async () => {
      await chatTab.press("Enter")
      await expect(chatTab).toHaveAttribute("aria-selected", "true", { timeout: 700 })
    }).toPass({ timeout: 15_000 })
    await expect(manager.getByRole("log").getByText("Texto atualizado", { exact: true }).first()).toBeVisible()
    await manager.getByRole("button", { name: "Fixar mensagem", exact: true }).first().click()
    await expect(manager.getByLabel("Mensagens fixadas")).toContainText("Texto atualizado")
    await manager.getByRole("log").locator("article").filter({ has: manager.getByRole("img", { name: "teste-chat.png", exact: true }) }).getByRole("button", { name: "Excluir mensagem", exact: true }).click()
    await manager.getByRole("dialog").getByRole("button", { name: "Excluir", exact: true }).click()
    await expect(a.getByRole("log").getByText("Mensagem removida", { exact: true })).toBeVisible()
    expect((await a.request.get(attachment.url)).status()).toBe(404)
    const duplicateId = randomUUID()
    const first = await a.request.post(`/api/v1/ministries/${ministryId}/chat`, { data: { clientId: duplicateId, body: "Teste de repetição" } })
    const repeated = await a.request.post(`/api/v1/ministries/${ministryId}/chat`, { data: { clientId: duplicateId, body: "Teste de repetição" } })
    expect((await first.json()).data.id).toBe((await repeated.json()).data.id)
    let failedOnce = false
    await a.route(`**/api/v1/ministries/${ministryId}/chat`, async route => {
      if (route.request().method() === "POST" && !failedOnce) { failedOnce = true; await route.abort(); return }
      await route.continue()
    })
    await a.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Rascunho preservado")
    await a.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(a.getByRole("alert").filter({ hasText: "Conexão interrompida" })).toBeVisible()
    await expect(a.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveValue("Rascunho preservado")
    await a.getByRole("button", { name: "Tentar enviar novamente", exact: true }).click()
    await expect(a.getByRole("log").getByText("Rascunho preservado", { exact: true })).toBeVisible()
    await a.unroute(`**/api/v1/ministries/${ministryId}/chat`)
    await sql`insert into public.ministry_chat_messages(company_id,ministry_id,sender_profile_id,client_id,body,created_at)
      select ${admin.company_id},${ministryId},${otherMember.id},gen_random_uuid(),'Histórico '||i::text,date_trunc('milliseconds',now() - make_interval(mins=>61-i)) from generate_series(1,60) i`
    await a.reload()
    await a.getByRole("button", { name: "Carregar mensagens anteriores", exact: true }).click()
    await expect(a.getByRole("log").getByText("Histórico 1", { exact: true })).toBeVisible()
    await a.getByRole("log").evaluate(element => { element.scrollTop = 0 })
    await b.getByRole("textbox", { name: "Mensagem", exact: true }).fill("Nova mensagem no fim")
    await b.getByRole("button", { name: "Enviar", exact: true }).click()
    await expect(a.getByRole("button", { name: "Novas mensagens", exact: true })).toBeVisible()
    await a.getByRole("button", { name: "Novas mensagens", exact: true }).click()
    await expect(a.getByRole("log").getByText("Nova mensagem no fim", { exact: true })).toBeVisible()
    const latestPage = (await (await a.request.get(`/api/v1/ministries/${ministryId}/chat`)).json()).data
    const lastMessage = latestPage.messages.at(-1)
    expect((await a.request.patch(`/api/v1/ministries/${ministryId}/chat`, { data: { action: "read", messageId: lastMessage.id } })).ok()).toBe(true)
    await expect.poll(async () => {
      const summaries = (await (await a.request.get("/api/v1/ministries/chats")).json()).data
      return summaries.find((chat: { id: string }) => chat.id === ministryId)?.unread
    }).toBe(0)
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await a.evaluate(() => document.documentElement.classList.add("dark"))
    await expect(a.getByRole("textbox", { name: "Mensagem", exact: true })).toBeVisible()
    await mkdir("artifacts", { recursive: true })
    await a.screenshot({ path: "artifacts/ministry-chat-mobile-dark.png", fullPage: true })
    await b.screenshot({ path: "artifacts/ministry-chat-desktop.png", fullPage: true })
    await sql`update public.ministry_memberships set status='inactive',left_at=current_date where ministry_id=${ministryId} and person_id=${member.person_id}`
    expect((await a.request.get(`/api/v1/ministries/${ministryId}/chat`)).status()).toBe(403)
    expect((await a.request.post(`/api/v1/ministries/${ministryId}/chat`, { data: { clientId: randomUUID(), body: "Bloqueado" } })).status()).toBe(403)
    await a.reload()
    await expect(a.getByRole("textbox", { name: "Mensagem", exact: true })).toHaveCount(0)
    expect(failures).toEqual([])
    const queue = await sql<{ n: number }[]>`select count(*)::int n from public.ministry_chat_push_outbox where ministry_id=${ministryId}`
    expect(queue[0].n).toBe(0)
  } finally {
    if (ministryId) paths = (await sql<{ storage_path: string }[]>`select storage_path from public.ministry_chat_attachments where ministry_id=${ministryId}`).map(row => row.storage_path)
    if (paths.length) {
      const { createClient } = await import("@supabase/supabase-js")
      const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
      const removed = await storage.storage.from("ministry-chat-assets").remove(paths)
      expect(removed.error).toBeNull()
    }
    if (ministryId || otherId) await sql`delete from public.ministries where id=any(${[ministryId,otherId].filter(Boolean)}::uuid[])`
    await Promise.all([memberContext.close(),peerContext.close(),adminContext.close()])
    await sql.end()
  }
})
