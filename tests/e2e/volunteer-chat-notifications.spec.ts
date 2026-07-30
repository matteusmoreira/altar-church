import { expect, test } from "@playwright/test"
import postgres from "postgres"
import { loginAs } from "./helpers/auth"
import { readE2EAccounts } from "./helpers/accounts"

const e2e = readE2EAccounts()
const volunteerAccount = e2e.portalAccounts?.volunteer
const connection = process.env.POSTGRES_URL

test("chat avisa ADM e voluntário sem precisar abrir a conversa", async ({ browser }) => {
  test.skip(!connection || !volunteerAccount, "Conta/DB E2E não configurados")
  const sql = postgres(connection!, { max: 1, prepare: false })
  const suffix = `${Date.now()}`
  const title = `Chat E2E ${suffix}`
  const endpoints = [`https://example.invalid/push/admin-${suffix}`, `https://example.invalid/push/volunteer-${suffix}`]
  let eventId = ""
  let scheduleId = ""
  let departmentId = ""
  const adminContext = await browser.newContext()
  const volunteerContext = await browser.newContext()
  try {
    const [admin] = await sql<{ id: string; company_id: string }[]>`
      select id, company_id from public.profiles where lower(email) = lower(${e2e.accounts.admin.email}) limit 1
    `
    const [volunteerProfile] = await sql<{ id: string; person_id: string | null }[]>`
      select id, person_id from public.profiles where lower(email) = lower(${volunteerAccount!.email}) limit 1
    `
    const [volunteer] = await sql<{ id: string; person_id: string }[]>`
      select volunteer.id, volunteer.person_id from public.volunteer_profiles volunteer
      join public.people person on person.id = volunteer.person_id
      where volunteer.company_id = ${admin.company_id} and volunteer.deleted_at is null
        and volunteer.person_id = ${volunteerProfile?.person_id ?? null}
      limit 1
    `
    if (!admin?.company_id || !volunteer?.id || !volunteerProfile?.id) throw new Error("Identidades E2E ausentes")
    const [department] = await sql<{ id: string }[]>`
      insert into public.volunteer_departments(company_id, manager_profile_id, name, created_by, updated_by)
      values (${admin.company_id}, ${admin.id}, ${title}, ${admin.id}, ${admin.id}) returning id
    `
    departmentId = department.id
    await sql`
      insert into public.volunteer_department_memberships(company_id, department_id, volunteer_id, role_name)
      values (${admin.company_id}, ${departmentId}, ${volunteer.id}, 'Recepção')
    `
    const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const [event] = await sql<{ id: string }[]>`
      insert into public.events(company_id, title, starts_at, ends_at, created_by, updated_by)
      values (${admin.company_id}, ${title}, ${startsAt}, ${new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)}, ${admin.id}, ${admin.id}) returning id
    `
    eventId = event.id
    await sql`update public.events set volunteer_schedule_published_at = now() where id = ${eventId}`
    const month = new Date(startsAt.getFullYear(), startsAt.getMonth(), 1).toISOString().slice(0, 10)
    const [schedule] = await sql<{ id: string }[]>`
      insert into public.volunteer_schedules(company_id, month, created_by, updated_by)
      values (${admin.company_id}, ${month}, ${admin.id}, ${admin.id})
      on conflict (company_id, month) do update set updated_at = now() returning id
    `
    scheduleId = schedule.id
    const [shift] = await sql<{ id: string }[]>`
      insert into public.volunteer_shifts(company_id, schedule_id, event_id, department_id, role_name, required_volunteers,
        starts_at, ends_at, checkin_opens_at, checkin_closes_at, instructions)
      values (${admin.company_id}, ${scheduleId}, ${eventId}, ${departmentId}, 'Recepção', 1,
        ${startsAt}, ${new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)}, ${new Date(startsAt.getTime() - 30 * 60 * 1000)}, ${new Date(startsAt.getTime() + 3 * 60 * 60 * 1000)}, 'Fixture de chat') returning id
    `
    await sql`
      insert into public.volunteer_assignments(company_id, shift_id, volunteer_id, status, created_by, updated_by, is_locked)
      values (${admin.company_id}, ${shift.id}, ${volunteer.id}, 'proposed', ${admin.id}, ${admin.id}, true)
    `
    await sql`
      insert into public.volunteer_notification_preferences(volunteer_id, company_id, chat_enabled, push_enabled)
      values (${volunteer.id}, ${admin.company_id}, true, true)
      on conflict (volunteer_id) do update set chat_enabled = true, push_enabled = true, updated_at = now()
    `
    await sql`
      insert into public.volunteer_push_subscriptions(company_id, volunteer_id, profile_id, endpoint, p256dh, auth_key, user_agent)
      values
        (${admin.company_id}, null, ${admin.id}, ${endpoints[0]}, 'e2e-p256dh-placeholder', 'e2e-auth-placeholder', 'playwright'),
        (${admin.company_id}, ${volunteer.id}, ${volunteerProfile.id}, ${endpoints[1]}, 'e2e-p256dh-placeholder', 'e2e-auth-placeholder', 'playwright')
    `

    const adminPage = await adminContext.newPage()
    await loginAs(adminPage, e2e.accounts.admin)
    await adminPage.goto("/voluntariado")
    const adminShift = adminPage.locator("div.rounded-lg.border.p-3").filter({ hasText: title }).first()
    await expect(adminShift).toBeVisible()
    await adminShift.getByRole("button", { name: "Chat" }).click()
    await adminShift.getByPlaceholder("Mensagem da escala").fill("Mensagem do ADM")
    await adminShift.getByRole("button", { name: "Enviar" }).click()
    await expect(adminShift.getByText("Mensagem do ADM")).toBeVisible()
    await adminShift.getByRole("button", { name: "Chat" }).click()

    const volunteerPage = await volunteerContext.newPage()
    await loginAs(volunteerPage, volunteerAccount!)
    await volunteerPage.goto("/membro/voluntariado")
    const volunteerCard = volunteerPage.locator('[data-slot="card"]').filter({ hasText: title }).first()
    await expect(volunteerCard.getByLabel("1 mensagens não lidas")).toBeVisible()
    await volunteerCard.getByRole("button", { name: /Chat/ }).click()
    await expect(volunteerCard.getByText("Mensagem do ADM")).toBeVisible()
    await expect(volunteerCard.getByLabel("1 mensagens não lidas")).toHaveCount(0)
    await volunteerCard.getByPlaceholder("Mensagem da escala").fill("Resposta do membro")
    await volunteerCard.getByRole("button", { name: "Enviar" }).click()
    await expect(volunteerCard.getByText("Resposta do membro")).toBeVisible()

    await expect(adminShift.getByLabel("1 mensagens não lidas")).toBeVisible({ timeout: 20_000 })
    await adminShift.getByRole("button", { name: /Chat/ }).click()
    await expect(adminShift.getByText("Resposta do membro")).toBeVisible()
    await expect(adminShift.getByLabel("1 mensagens não lidas")).toHaveCount(0)
    const outbox = await sql<{ target_profile_id: string }[]>`
      select target_profile_id from public.volunteer_delivery_outbox
      where chat_message_id in (select id from public.volunteer_shift_messages
        where conversation_id in (select id from public.volunteer_shift_conversations where shift_id = ${shift.id}))
    `
    expect(new Set(outbox.map((row) => row.target_profile_id))).toEqual(new Set([admin.id, volunteerProfile.id]))

    await adminShift.getByRole("button", { name: "Excluir escala" }).click()
    await adminPage.getByRole("button", { name: "Excluir permanentemente" }).click()
    await expect(adminPage.getByText("Escala excluída")).toBeVisible()
    const [deletedState] = await sql<{ event_exists: boolean; published_cleared: boolean; shift_count: number; audit_count: number }[]>`
      select
        exists(select 1 from public.events where id = ${eventId}) as event_exists,
        (select volunteer_schedule_published_at is null from public.events where id = ${eventId}) as published_cleared,
        (select count(*)::int from public.volunteer_shifts where event_id = ${eventId}) as shift_count,
        (select count(*)::int from public.audit_logs where action = 'volunteer_schedule.delete' and entity_id = ${eventId}) as audit_count
    `
    expect(deletedState).toMatchObject({ event_exists: true, published_cleared: true, shift_count: 0 })
    expect(deletedState.audit_count).toBeGreaterThan(0)
  } finally {
    await adminContext.close()
    await volunteerContext.close()
    if (departmentId) await sql`delete from public.volunteer_shifts where department_id = ${departmentId}`
    if (eventId) await sql`delete from public.events where id = ${eventId}`
    if (departmentId) await sql`delete from public.volunteer_departments where id = ${departmentId}`
    for (const endpoint of endpoints) await sql`delete from public.volunteer_push_subscriptions where endpoint = ${endpoint}`
    if (scheduleId) await sql`delete from public.volunteer_schedules schedule where schedule.id = ${scheduleId} and not exists(select 1 from public.volunteer_shifts shift where shift.schedule_id = schedule.id)`
    await sql.end()
  }
})
