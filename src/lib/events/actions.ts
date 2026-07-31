"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { getPublicEventByToken } from "./data"
import { eventCommunicationTemplates } from "./types"
import type { EventPublicRegistration } from "./types"

const uuid = z.string().uuid()
const phone = z.string().trim().max(30).default("")

function result(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível concluir a operação" }
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 20)
}

async function publicAudit(companyId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  await getSql()`
    insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
    values (${companyId}, ${action}, 'event_guest_registrations', ${entityId}, ${JSON.stringify(metadata)}::jsonb)
  `
}

async function queueGuestConfirmation(input: { companyId: string; eventId: string; guestId: string; eventTitle: string; eventToken: string; status: EventPublicRegistration["status"] }) {
  const sql = getSql()
  await sql.begin(async (tx) => {
    const guests = await tx<{ email: string; phone: string; full_name: string }[]>`
      select email, phone, full_name from public.event_guest_registrations
      where id = ${input.guestId} and company_id = ${input.companyId} and event_id = ${input.eventId} limit 1
    `
    const guest = guests[0]
    if (!guest) return
    const channel = guest.email ? "email" : guest.phone ? "whatsapp" : null
    const recipient = channel === "email" ? guest.email.toLowerCase() : channel === "whatsapp" ? guest.phone : null
    if (!channel || !recipient) return
    const title = input.status === "waitlisted" ? `Inscrição em espera: ${input.eventTitle}` : `Inscrição confirmada: ${input.eventTitle}`
    const content = `${guest.full_name}, sua inscrição foi registrada como ${input.status === "waitlisted" ? "lista de espera" : "confirmada"}.\nAcesse: /eventos/publico/${input.eventToken}`
    const notifications = await tx<{ id: string }[]>`
      insert into public.notifications(company_id, title, content, method, type, target_group, scheduled_send, audience_kind, audience_ref_id, audience_person_ids, snapshot_at, snapshot_count, status, event_id, event_template_key)
      values (${input.companyId}, ${title}, ${content}, ${channel}, 'group', 'guests', false, 'event_guests', ${input.eventId}, '[]'::jsonb, now(), 1, 'queued', ${input.eventId}, ${`confirmation:${channel}:guest:${input.guestId}`})
      on conflict (company_id, event_id, event_template_key) where event_id is not null and event_template_key is not null and deleted_at is null do nothing
      returning id
    `
    const notificationId = notifications[0]?.id
    if (!notificationId) return
    await tx`
      insert into public.notification_deliveries(notification_id, company_id, guest_registration_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
      values (${notificationId}, ${input.companyId}, ${input.guestId}, ${channel}, ${recipient}, ${guest.full_name}, 'pending', now(), ${notificationId} || ':' || ${input.guestId} || ':' || ${channel})
      on conflict (delivery_key) do nothing
    `
  })
}

export async function registerGuestForEvent(input: {
  eventToken: string
  fullName: string
  email?: string
  phone?: string
  consent: boolean
}): Promise<{ ok: true; registration: EventPublicRegistration } | { ok: false; error: string }> {
  try {
    const parsed = z.object({
      eventToken: uuid,
      fullName: z.string().trim().min(2, "Informe seu nome").max(200),
      email: z.string().trim().email("E-mail inválido").max(240).optional().or(z.literal("")),
      phone,
      consent: z.literal(true, "Aceite o uso dos dados para confirmar a inscrição"),
    }).parse({ ...input, phone: input.phone ?? "", email: input.email ?? "" })
    const normalizedPhone = normalizePhone(parsed.phone)
    const parsedEmail = parsed.email ?? ""
    if (!parsedEmail && normalizedPhone.length < 8) throw new Error("Informe e-mail ou telefone")
    const publicEvent = await getPublicEventByToken(parsed.eventToken)
    if (!publicEvent || !publicEvent.registrationEnabled) throw new Error("Este evento não aceita inscrições")

    const eventRows = await getSql()<{ id: string; company_id: string; title: string; public_token: string; max_capacity: number; starts_at: Date; status: string }[]>`
      select id, company_id, title, public_token, max_capacity, starts_at, status
      from public.events
      where public_token = ${parsed.eventToken}::uuid and is_public and status = 'published' and deleted_at is null
      limit 1
    `
    const event = eventRows[0]
    if (!event) throw new Error("Evento não encontrado")
    if (new Date(event.starts_at).getTime() < Date.now() - 24 * 60 * 60 * 1000) throw new Error("As inscrições deste evento foram encerradas")

    let lockedEvent = event
    const registration = await getSql().begin(async (tx) => {
      const lockedRows = await tx<{ id: string; company_id: string; title: string; public_token: string; max_capacity: number; starts_at: Date; status: string }[]>`
        select id, company_id, title, public_token, max_capacity, starts_at, status
        from public.events
        where public_token = ${parsed.eventToken}::uuid and is_public and status = 'published' and deleted_at is null
        limit 1 for update
      `
      const locked = lockedRows[0]
      if (!locked) throw new Error("Evento não encontrado")
      lockedEvent = locked
      const duplicate = await tx<{ id: string; confirmation_token: string; status: EventPublicRegistration["status"] }[]>`
        select id, confirmation_token, status
        from public.event_guest_registrations
        where company_id = ${lockedEvent.company_id} and event_id = ${lockedEvent.id} and status <> 'canceled'
          and (
            (${parsedEmail} <> '' and lower(email) = lower(${parsedEmail}))
            or (${normalizedPhone} <> '' and phone = ${normalizedPhone})
          )
        order by created_at desc
        limit 1
        for update
      `
      if (duplicate[0]) throw new Error("Já existe uma inscrição com este e-mail ou telefone")

      const counts = await tx<{ going: number }[]>`
        select (
          (select count(*) from public.member_event_rsvps where company_id = ${lockedEvent.company_id} and event_id = ${lockedEvent.id} and status = 'going')
          + (select count(*) from public.event_guest_registrations where company_id = ${lockedEvent.company_id} and event_id = ${lockedEvent.id} and status = 'going')
        )::integer as going
      `
      const going = Number(counts[0]?.going ?? 0)
      const status: EventPublicRegistration["status"] = lockedEvent.max_capacity > 0 && going >= lockedEvent.max_capacity ? "waitlisted" : "going"
      const rows = await tx<{ id: string; confirmation_token: string; status: EventPublicRegistration["status"] }[]>`
        insert into public.event_guest_registrations (
          company_id, event_id, full_name, email, phone, consent_at, status
        ) values (
          ${lockedEvent.company_id}, ${lockedEvent.id}, ${parsed.fullName}, ${parsedEmail}, ${normalizedPhone}, now(), ${status}
        ) returning id, confirmation_token, status
      `
      if (!rows[0]) throw new Error("Inscrição não foi criada")
      return rows[0]
    })
    await publicAudit(lockedEvent.company_id, "event.guest.register", registration.id, { eventId: lockedEvent.id, status: registration.status })
    await queueGuestConfirmation({ companyId: lockedEvent.company_id, eventId: lockedEvent.id, guestId: registration.id, eventTitle: lockedEvent.title, eventToken: lockedEvent.public_token, status: registration.status })
    return {
      ok: true,
      registration: {
        id: registration.id,
        token: registration.confirmation_token,
        eventToken: lockedEvent.public_token,
        eventTitle: lockedEvent.title,
        fullName: parsed.fullName,
        email: parsedEmail,
        phone: normalizedPhone,
        status: registration.status,
      },
    }
  } catch (error) {
    return result(error)
  }
}

export async function cancelGuestEventRegistration(tokenInput: string) {
  try {
    const token = uuid.parse(tokenInput)
    const row = await getSql().begin(async (tx) => {
      const rows = await tx<{ id: string; company_id: string; event_id: string; status: string }[]>`
        update public.event_guest_registrations
        set status = 'canceled', canceled_at = now(), updated_at = now()
        where confirmation_token = ${token}::uuid and status in ('going', 'waitlisted')
        returning id, company_id, event_id, status
      `
      if (!rows[0]) throw new Error("Inscrição não encontrada ou já cancelada")
      const eventRows = await tx<{ max_capacity: number }[]>`select max_capacity from public.events where id = ${rows[0].event_id} and company_id = ${rows[0].company_id} for update`
      const capacity = Number(eventRows[0]?.max_capacity ?? 0)
      if (capacity > 0) {
        const goingRows = await tx<{ count: number }[]>`select count(*)::integer as count from public.member_event_rsvps where event_id = ${rows[0].event_id} and company_id = ${rows[0].company_id} and status = 'going'`
        const guestGoingRows = await tx<{ count: number }[]>`select count(*)::integer as count from public.event_guest_registrations where event_id = ${rows[0].event_id} and company_id = ${rows[0].company_id} and status = 'going'`
        if (Number(goingRows[0]?.count ?? 0) + Number(guestGoingRows[0]?.count ?? 0) < capacity) {
          const promotedMember = await tx<{ id: string }[]>`select id from public.member_event_rsvps where event_id = ${rows[0].event_id} and company_id = ${rows[0].company_id} and status = 'waitlisted' order by created_at, id limit 1 for update skip locked`
          if (promotedMember[0]) await tx`update public.member_event_rsvps set status = 'going', updated_at = now() where id = ${promotedMember[0].id}`
          else {
            const promotedGuest = await tx<{ id: string }[]>`select id from public.event_guest_registrations where event_id = ${rows[0].event_id} and company_id = ${rows[0].company_id} and status = 'waitlisted' order by created_at, id limit 1 for update skip locked`
            if (promotedGuest[0]) await tx`update public.event_guest_registrations set status = 'going', updated_at = now() where id = ${promotedGuest[0].id}`
          }
        }
      }
      return rows[0]
    })
    await publicAudit(row.company_id, "event.guest.cancel", row.id, { eventId: row.event_id })
    return { ok: true as const }
  } catch (error) {
    return result(error)
  }
}

async function managerContext(permission: "events.view" | "events.edit" | "events.create" | "events.delete", requestedCompanyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, requestedCompanyId)
  await requirePermission(permission, companyId)
  return { user, companyId }
}

export async function createEventCheckinSession(eventIdInput: string) {
  try {
    const eventId = uuid.parse(eventIdInput)
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    const events = await sql<{ id: string; title: string; starts_at: Date; ends_at: Date | null }[]>`
      select id, title, starts_at, ends_at from public.events
      where id = ${eventId} and company_id = ${companyId} and status = 'published' and deleted_at is null limit 1
    `
    const event = events[0]
    if (!event) throw new Error("Evento publicado não encontrado")
    const endsAt = event.ends_at ? new Date(event.ends_at) : new Date(new Date(event.starts_at).getTime() + 3 * 60 * 60 * 1000)
    const expiresAt = new Date(endsAt.getTime() + 2 * 60 * 60 * 1000)
    await sql`update public.event_checkin_sessions set closed_at = now() where event_id = ${eventId} and company_id = ${companyId} and closed_at is null`
    const rows = await sql<{ token: string; expires_at: Date }[]>`
      insert into public.event_checkin_sessions(company_id, event_id, opens_at, expires_at, created_by)
      values (${companyId}, ${eventId}, now(), ${expiresAt}, ${user.id})
      returning token, expires_at
    `
    if (!rows[0]) throw new Error("Sessão de check-in não foi criada")
    await writeAuditLog({ action: "event.checkin.session.open", entityTable: "event_checkin_sessions", entityId: rows[0].token, companyId, metadata: { eventId } })
    revalidatePath(`/eventos/${eventId}`)
    return { ok: true as const, token: rows[0].token, expiresAt: rows[0].expires_at.toISOString() }
  } catch (error) {
    return result(error)
  }
}

export async function closeEventCheckinSession(eventIdInput: string) {
  try {
    const eventId = uuid.parse(eventIdInput)
    const { companyId } = await managerContext("events.edit")
    const rows = await getSql()<{ token: string }[]>`
      update public.event_checkin_sessions set closed_at = now()
      where event_id = ${eventId} and company_id = ${companyId} and closed_at is null
      returning token
    `
    await writeAuditLog({ action: "event.checkin.session.close", entityTable: "event_checkin_sessions", entityId: rows[0]?.token, companyId, metadata: { eventId } })
    revalidatePath(`/eventos/${eventId}`)
    return { ok: true as const }
  } catch (error) {
    return result(error)
  }
}

export async function rotateEventPublicToken(eventIdInput: string) {
  try {
    const eventId = uuid.parse(eventIdInput)
    const { user, companyId } = await managerContext("events.edit")
    const rows = await getSql()<{ public_token: string }[]>`
      update public.events set public_token = gen_random_uuid(), updated_by = ${user.id}, updated_at = now()
      where id = ${eventId} and company_id = ${companyId} and deleted_at is null
      returning public_token
    `
    if (!rows[0]) throw new Error("Evento não encontrado")
    await writeAuditLog({ action: "event.public_token.rotate", entityTable: "events", entityId: eventId, companyId })
    revalidatePath(`/eventos/${eventId}`)
    revalidatePath("/eventos")
    return { ok: true as const, token: rows[0].public_token }
  } catch (error) {
    return result(error)
  }
}

export async function issueEventAttendeeToken(input: { eventId: string; kind: "member" | "guest"; attendeeId: string }) {
  try {
    const eventId = uuid.parse(input.eventId)
    const attendeeId = uuid.parse(input.attendeeId)
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    let existing: { token: string }[] = []
    if (input.kind === "member") {
      const rows = await sql<{ id: string }[]>`select id from public.member_event_rsvps where id = ${attendeeId} and company_id = ${companyId} and event_id = ${eventId} and status = 'going' limit 1`
      if (!rows[0]) throw new Error("Inscrito não encontrado")
      existing = await sql<{ token: string }[]>`select token from public.event_attendee_tokens where member_rsvp_id = ${attendeeId} and company_id = ${companyId} limit 1`
      if (!existing[0]) {
        existing = await sql<{ token: string }[]>`insert into public.event_attendee_tokens(company_id, event_id, member_rsvp_id, created_by) values (${companyId}, ${eventId}, ${attendeeId}, ${user.id}) returning token`
      }
    } else {
      const rows = await sql<{ id: string }[]>`select id from public.event_guest_registrations where id = ${attendeeId} and company_id = ${companyId} and event_id = ${eventId} and status = 'going' limit 1`
      if (!rows[0]) throw new Error("Visitante inscrito não encontrado")
      existing = await sql<{ token: string }[]>`select token from public.event_attendee_tokens where guest_registration_id = ${attendeeId} and company_id = ${companyId} limit 1`
      if (!existing[0]) {
        existing = await sql<{ token: string }[]>`insert into public.event_attendee_tokens(company_id, event_id, guest_registration_id, created_by) values (${companyId}, ${eventId}, ${attendeeId}, ${user.id}) returning token`
      }
    }
    if (!existing[0]) throw new Error("QR não foi criado")
    await writeAuditLog({ action: "event.checkin.attendee_token.issue", entityTable: "event_attendee_tokens", entityId: existing[0].token, companyId, metadata: { eventId, kind: input.kind, attendeeId } })
    return { ok: true as const, token: existing[0].token }
  } catch (error) {
    return result(error)
  }
}

export async function checkInEventAttendee(tokenInput: string) {
  try {
    const token = uuid.parse(tokenInput)
    const sql = getSql()
    const resultRow = await sql.begin(async (tx) => {
      const rows = await tx<{
        token: string; company_id: string; event_id: string; event_title: string; session_token: string;
        member_rsvp_id: string | null; guest_registration_id: string | null; person_id: string | null;
        person_name: string | null; guest_name: string | null; status: string
      }[]>`
        select attendee.token, attendee.company_id, attendee.event_id, event.title as event_title,
          session.token as session_token, attendee.member_rsvp_id, attendee.guest_registration_id,
          rsvp.person_id, person.full_name as person_name, guest.full_name as guest_name,
          coalesce(rsvp.status, guest.status) as status
        from public.event_attendee_tokens attendee
        join public.events event on event.id = attendee.event_id and event.status = 'published' and event.deleted_at is null
        join public.event_checkin_sessions session on session.event_id = event.id and session.company_id = attendee.company_id
          and session.closed_at is null and now() between session.opens_at and session.expires_at
        left join public.member_event_rsvps rsvp on rsvp.id = attendee.member_rsvp_id
        left join public.people person on person.id = rsvp.person_id
        left join public.event_guest_registrations guest on guest.id = attendee.guest_registration_id
        where attendee.token = ${token}::uuid
        limit 1
        for update of attendee
      `
      const row = rows[0]
      if (!row) throw new Error("QR inválido, expirado ou check-in fechado")
      if (row.status !== "going") throw new Error("Esta inscrição não está ativa")
      const personName = row.person_name ?? row.guest_name ?? ""
      let attendanceId: string | undefined
      if (row.member_rsvp_id && row.person_id) {
        const saved = await tx<{ id: string }[]>`
          insert into public.attendance_records(
            company_id, person_id, person_name, event_type, event_ref_id, event_ref_name,
            occurred_on, occurred_time, status, registered_by_name, checkin_source, event_checkin_session_token, checkin_at
          ) values (
            ${row.company_id}, ${row.person_id}, ${personName}, 'event', ${row.event_id}, ${row.event_title},
            current_date, localtime, 'present', 'QR do participante', 'qr', ${row.session_token}::uuid, now()
          ) on conflict (company_id, event_ref_id, person_id)
          where event_type = 'event' and person_id is not null and deleted_at is null
          do update set status = 'present', occurred_on = current_date, occurred_time = localtime,
            registered_by_name = 'QR do participante', checkin_source = 'qr', event_checkin_session_token = excluded.event_checkin_session_token,
            checkin_at = now(), updated_at = now()
          returning id
        `
        attendanceId = saved[0]?.id
      } else if (row.guest_registration_id) {
        const saved = await tx<{ id: string }[]>`
          insert into public.attendance_records(
            company_id, person_name, event_type, event_ref_id, event_ref_name,
            occurred_on, occurred_time, status, registered_by_name, guest_registration_id,
            checkin_source, event_checkin_session_token, checkin_at
          ) values (
            ${row.company_id}, ${personName}, 'event', ${row.event_id}, ${row.event_title},
            current_date, localtime, 'present', 'QR do participante', ${row.guest_registration_id},
            'qr', ${row.session_token}::uuid, now()
          ) on conflict (company_id, event_ref_id, guest_registration_id)
          where event_type = 'event' and guest_registration_id is not null and deleted_at is null
          do update set status = 'present', occurred_on = current_date, occurred_time = localtime,
            registered_by_name = 'QR do participante', checkin_source = 'qr', event_checkin_session_token = excluded.event_checkin_session_token,
            checkin_at = now(), updated_at = now()
          returning id
        `
        attendanceId = saved[0]?.id
        await tx`update public.event_guest_registrations set checked_in_at = now(), updated_at = now() where id = ${row.guest_registration_id}`
      }
      await tx`update public.event_attendee_tokens set last_used_at = now() where token = ${row.token}`
      return { id: attendanceId, name: personName, eventTitle: row.event_title, companyId: row.company_id }
    })
    await publicAudit(resultRow.companyId, "event.checkin.qr", resultRow.id ?? token, { eventTitle: resultRow.eventTitle })
    return { ok: true as const, name: resultRow.name, eventTitle: resultRow.eventTitle }
  } catch (error) {
    return result(error)
  }
}

export async function checkInEventSession(input: { sessionToken: string; fullName: string; phone: string }) {
  try {
    const parsed = z.object({ sessionToken: uuid, fullName: z.string().trim().min(2, "Informe o nome").max(200), phone: z.string().trim().min(8, "Informe um telefone").max(30) }).parse(input)
    const normalizedPhone = normalizePhone(parsed.phone)
    if (normalizedPhone.length < 8) throw new Error("Telefone inválido")
    const resultRow = await getSql().begin(async (tx) => {
      const sessions = await tx<{ token: string; company_id: string; event_id: string; event_title: string }[]>`
        select session.token, session.company_id, session.event_id, event.title as event_title
        from public.event_checkin_sessions session join public.events event on event.id = session.event_id and event.status = 'published' and event.deleted_at is null
        where session.token = ${parsed.sessionToken}::uuid and session.closed_at is null and now() between session.opens_at and session.expires_at
        limit 1 for update of session
      `
      const session = sessions[0]
      if (!session) throw new Error("QR do evento inválido, expirado ou encerrado")
      const member = await tx<{ person_id: string; person_name: string }[]>`
        select person.id as person_id, person.full_name as person_name
        from public.people person
        join public.member_event_rsvps rsvp on rsvp.person_id = person.id and rsvp.event_id = ${session.event_id} and rsvp.company_id = ${session.company_id} and rsvp.status = 'going'
        where person.company_id = ${session.company_id} and person.deleted_at is null and regexp_replace(person.phone, '\\D', '', 'g') = ${normalizedPhone}
        limit 1
      `
      if (member[0]) {
        const saved = await tx<{ id: string }[]>`
          insert into public.attendance_records(company_id, person_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, occurred_time, status, registered_by_name, checkin_source, event_checkin_session_token, checkin_at)
          values (${session.company_id}, ${member[0].person_id}, ${member[0].person_name}, 'event', ${session.event_id}, ${session.event_title}, current_date, localtime, 'present', 'QR do evento', 'qr', ${session.token}::uuid, now())
          on conflict (company_id, event_ref_id, person_id) where event_type = 'event' and person_id is not null and deleted_at is null
          do update set status = 'present', person_name = excluded.person_name, occurred_on = current_date, occurred_time = localtime, registered_by_name = 'QR do evento', checkin_source = 'qr', event_checkin_session_token = excluded.event_checkin_session_token, checkin_at = now(), updated_at = now()
          returning id
        `
        return { companyId: session.company_id, eventId: session.event_id, eventTitle: session.event_title, name: member[0].person_name, id: saved[0]?.id }
      }
      const existingGuest = await tx<{ id: string; full_name: string }[]>`
        select id, full_name from public.event_guest_registrations
        where company_id = ${session.company_id} and event_id = ${session.event_id} and phone = ${normalizedPhone} and status <> 'canceled'
        order by created_at desc limit 1 for update
      `
      const guest = existingGuest[0] ?? (await tx<{ id: string; full_name: string }[]>`
        insert into public.event_guest_registrations(company_id, event_id, full_name, phone, consent_at, status)
        values (${session.company_id}, ${session.event_id}, ${parsed.fullName}, ${normalizedPhone}, now(), 'going') returning id, full_name
      `)[0]
      if (!guest) throw new Error("Visitante não foi registrado")
      const saved = await tx<{ id: string }[]>`
        insert into public.attendance_records(company_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, occurred_time, status, registered_by_name, guest_registration_id, checkin_source, event_checkin_session_token, checkin_at)
        values (${session.company_id}, ${guest.full_name}, 'event', ${session.event_id}, ${session.event_title}, current_date, localtime, 'present', 'QR do evento', ${guest.id}, 'qr', ${session.token}::uuid, now())
        on conflict (company_id, event_ref_id, guest_registration_id) where event_type = 'event' and guest_registration_id is not null and deleted_at is null
        do update set status = 'present', person_name = excluded.person_name, occurred_on = current_date, occurred_time = localtime, registered_by_name = 'QR do evento', checkin_source = 'qr', event_checkin_session_token = excluded.event_checkin_session_token, checkin_at = now(), updated_at = now()
        returning id
      `
      await tx`update public.event_guest_registrations set checked_in_at = now(), updated_at = now() where id = ${guest.id}`
      return { companyId: session.company_id, eventId: session.event_id, eventTitle: session.event_title, name: guest.full_name, id: saved[0]?.id }
    })
    await publicAudit(resultRow.companyId, "event.checkin.event_qr", resultRow.id ?? parsed.sessionToken, { eventId: resultRow.eventId, name: resultRow.name })
    return { ok: true as const, name: resultRow.name, eventTitle: resultRow.eventTitle }
  } catch (error) {
    return result(error)
  }
}

export async function manualCheckInEventParticipant(input: { eventId: string; kind: "member" | "guest"; attendeeId: string }) {
  try {
    const eventId = uuid.parse(input.eventId)
    const attendeeId = uuid.parse(input.attendeeId)
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    const eventRows = await sql<{ title: string }[]>`select title from public.events where id = ${eventId} and company_id = ${companyId} and deleted_at is null limit 1`
    if (!eventRows[0]) throw new Error("Evento não encontrado")
    if (input.kind === "member") {
      const rows = await sql<{ person_id: string; person_name: string }[]>`
        select rsvp.person_id, person.full_name as person_name from public.member_event_rsvps rsvp
        join public.people person on person.id = rsvp.person_id
        where rsvp.id = ${attendeeId} and rsvp.company_id = ${companyId} and rsvp.event_id = ${eventId} and rsvp.status = 'going' limit 1
      `
      const participant = rows[0]
      if (!participant) throw new Error("Inscrito não encontrado")
      const saved = await sql<{ id: string }[]>`
        insert into public.attendance_records(company_id, person_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, occurred_time, status, registered_by, registered_by_name, checkin_source, checkin_at)
        values (${companyId}, ${participant.person_id}, ${participant.person_name}, 'event', ${eventId}, ${eventRows[0].title}, current_date, localtime, 'present', ${user.id}, ${user.name}, 'manual', now())
        on conflict (company_id, event_ref_id, person_id) where event_type = 'event' and person_id is not null and deleted_at is null
        do update set status = 'present', occurred_on = current_date, occurred_time = localtime, registered_by = excluded.registered_by, registered_by_name = excluded.registered_by_name, checkin_source = 'manual', checkin_at = now(), updated_at = now()
        returning id
      `
      await writeAuditLog({ action: "event.checkin.manual", entityTable: "attendance_records", entityId: saved[0]?.id, companyId, metadata: { eventId, kind: input.kind, attendeeId } })
      revalidatePath(`/eventos/${eventId}`)
      return { ok: true as const, id: saved[0]?.id }
    }
    const rows = await sql<{ full_name: string }[]>`select full_name from public.event_guest_registrations where id = ${attendeeId} and company_id = ${companyId} and event_id = ${eventId} and status = 'going' limit 1`
    if (!rows[0]) throw new Error("Visitante inscrito não encontrado")
    const saved = await sql<{ id: string }[]>`
      insert into public.attendance_records(company_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, occurred_time, status, registered_by, registered_by_name, guest_registration_id, checkin_source, checkin_at)
      values (${companyId}, ${rows[0].full_name}, 'event', ${eventId}, ${eventRows[0].title}, current_date, localtime, 'present', ${user.id}, ${user.name}, ${attendeeId}, 'manual', now())
      on conflict (company_id, event_ref_id, guest_registration_id) where event_type = 'event' and guest_registration_id is not null and deleted_at is null
      do update set status = 'present', occurred_on = current_date, occurred_time = localtime, registered_by = excluded.registered_by, registered_by_name = excluded.registered_by_name, checkin_source = 'manual', checkin_at = now(), updated_at = now()
      returning id
    `
    await sql`update public.event_guest_registrations set checked_in_at = now(), updated_at = now() where id = ${attendeeId} and company_id = ${companyId}`
    await writeAuditLog({ action: "event.checkin.manual", entityTable: "attendance_records", entityId: saved[0]?.id, companyId, metadata: { eventId, kind: input.kind, attendeeId } })
    revalidatePath(`/eventos/${eventId}`)
    return { ok: true as const, id: saved[0]?.id }
  } catch (error) {
    return result(error)
  }
}

export async function linkEventGuestToPerson(input: { eventId: string; guestId: string; personId: string }) {
  try {
    const eventId = uuid.parse(input.eventId)
    const guestId = uuid.parse(input.guestId)
    const personId = uuid.parse(input.personId)
    const { companyId } = await managerContext("events.edit")
    const sql = getSql()
    const valid = await sql<{ id: string }[]>`select id from public.people where id = ${personId} and company_id = ${companyId} and deleted_at is null limit 1`
    if (!valid[0]) throw new Error("Pessoa fora do tenant")
    const rows = await sql<{ id: string }[]>`update public.event_guest_registrations set person_id = ${personId}, updated_at = now() where id = ${guestId} and event_id = ${eventId} and company_id = ${companyId} returning id`
    if (!rows[0]) throw new Error("Inscrição de visitante não encontrada")
    await writeAuditLog({ action: "event.guest.link_person", entityTable: "event_guest_registrations", entityId: guestId, companyId, metadata: { eventId, personId } })
    revalidatePath(`/eventos/${eventId}`)
    return { ok: true as const, id: rows[0].id }
  } catch (error) {
    return result(error)
  }
}

export async function createEventGuestCrmProfile(input: { eventId: string; guestId: string }) {
  try {
    const parsed = z.object({ eventId: uuid, guestId: uuid }).parse(input)
    const { user, companyId } = await managerContext("events.edit")
    const resultRow = await getSql().begin(async (tx) => {
      const guestRows = await tx<{ id: string; full_name: string; email: string; phone: string; person_id: string | null; consent_at: Date | null; event_title: string }[]>`
        select guest.id, guest.full_name, guest.email, guest.phone, guest.person_id, guest.consent_at, event.title as event_title
        from public.event_guest_registrations guest
        join public.events event on event.id = guest.event_id and event.company_id = guest.company_id
        where guest.id = ${parsed.guestId} and guest.event_id = ${parsed.eventId} and guest.company_id = ${companyId}
        limit 1 for update
      `
      const guest = guestRows[0]
      if (!guest) throw new Error("Visitante não encontrado")
      if (!guest.consent_at) throw new Error("Visitante não autorizou acompanhamento")
      if (guest.person_id) return { personId: guest.person_id, cardId: null, eventTitle: guest.event_title }
      if (!guest.email && !guest.phone) throw new Error("Visitante sem contato para vincular ao cadastro")

      const existing = await tx<{ id: string }[]>`
        select id from public.people
        where company_id = ${companyId} and deleted_at is null
          and (
            (nullif(btrim(${guest.email}), '') is not null and lower(btrim(email)) = lower(btrim(${guest.email})))
            or (nullif(regexp_replace(${guest.phone}, '\\D', '', 'g'), '') is not null and regexp_replace(phone, '\\D', '', 'g') = regexp_replace(${guest.phone}, '\\D', '', 'g'))
          )
        order by created_at limit 1
      `
      const nameParts = guest.full_name.trim().split(/\s+/)
      const firstName = nameParts.shift() ?? guest.full_name.trim()
      const lastName = nameParts.join(" ")
      const personRows = existing[0]
        ? existing
        : await tx<{ id: string }[]>`
            insert into public.people(company_id, first_name, last_name, full_name, email, phone, status, person_type, journey_status, internal_notes, is_active, created_by, updated_by)
            values (${companyId}, ${firstName}, ${lastName}, ${guest.full_name}, nullif(lower(btrim(${guest.email})), ''), ${guest.phone}, 'visitor', 'visitor', 'new', ${`Origem: evento ${guest.event_title}`}, true, ${user.id}, ${user.id})
            returning id
          `
      const personId = personRows[0]?.id
      if (!personId) throw new Error("Pessoa não foi criada")
      await tx`update public.event_guest_registrations set person_id = ${personId}, updated_at = now() where id = ${guest.id} and company_id = ${companyId}`
      const stageRows = await tx<{ id: string }[]>`
        select id from public.crm_stages where company_id = ${companyId} and deleted_at is null order by is_default desc, sort_order, created_at limit 1
      `
      const stageId = stageRows[0]?.id
      let cardId: string | null = null
      if (stageId) {
        const existingCards = await tx<{ id: string }[]>`
          select id from public.crm_cards where company_id = ${companyId} and person_id = ${personId} and deleted_at is null and source = ${`Evento: ${guest.event_title}`} limit 1
        `
        if (existingCards[0]) cardId = existingCards[0].id
        else {
          const cards = await tx<{ id: string }[]>`
            insert into public.crm_cards(company_id, person_id, person_name, person_phone, person_email, stage_id, source, notes, created_by, updated_by)
            values (${companyId}, ${personId}, ${guest.full_name}, ${guest.phone}, ${guest.email}, ${stageId}, ${`Evento: ${guest.event_title}`}, 'Visitante vinculado após consentimento.', ${user.id}, ${user.id})
            returning id
          `
          cardId = cards[0]?.id ?? null
        }
      }
      return { personId, cardId, eventTitle: guest.event_title }
    })
    await writeAuditLog({ action: "event.guest.crm_link", entityTable: "event_guest_registrations", entityId: parsed.guestId, companyId, metadata: { eventId: parsed.eventId, personId: resultRow.personId, cardId: resultRow.cardId } })
    revalidatePath(`/eventos/${parsed.eventId}`)
    return { ok: true as const, personId: resultRow.personId, cardId: resultRow.cardId }
  } catch (error) {
    return result(error)
  }
}

export async function saveEventResource(input: { eventId: string; id?: string | null; title: string; notes?: string; externalUrl?: string; visibility?: "private" | "public" }) {
  try {
    const parsed = z.object({
      eventId: uuid,
      id: uuid.nullable().optional(),
      title: z.string().trim().min(2, "Informe o título").max(200),
      notes: z.string().trim().max(5000).default(""),
      externalUrl: z.string().trim().url("URL inválida").optional().or(z.literal("")),
      visibility: z.enum(["private", "public"]).default("private"),
    }).parse({ ...input, notes: input.notes ?? "", externalUrl: input.externalUrl ?? "", visibility: input.visibility ?? "private" })
    if (!parsed.notes && !parsed.externalUrl) throw new Error("Informe observação ou URL")
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    const rows = parsed.id
      ? await sql<{ id: string }[]>`update public.event_resources set title = ${parsed.title}, notes = ${parsed.notes}, external_url = ${parsed.externalUrl || null}, visibility = ${parsed.visibility}, updated_by = ${user.id}, updated_at = now() where id = ${parsed.id} and event_id = ${parsed.eventId} and company_id = ${companyId} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`insert into public.event_resources(company_id, event_id, title, notes, external_url, visibility, created_by, updated_by) values (${companyId}, ${parsed.eventId}, ${parsed.title}, ${parsed.notes}, ${parsed.externalUrl || null}, ${parsed.visibility}, ${user.id}, ${user.id}) returning id`
    if (!rows[0]) throw new Error("Recurso não salvo")
    await writeAuditLog({ action: parsed.id ? "event.resource.update" : "event.resource.create", entityTable: "event_resources", entityId: rows[0].id, companyId, metadata: { eventId: parsed.eventId } })
    revalidatePath(`/eventos/${parsed.eventId}`)
    return { ok: true as const, id: rows[0].id }
  } catch (error) {
    return result(error)
  }
}

export async function deleteEventResource(input: { eventId: string; resourceId: string }) {
  try {
    const eventId = uuid.parse(input.eventId)
    const resourceId = uuid.parse(input.resourceId)
    const { user, companyId } = await managerContext("events.delete")
    const rows = await getSql()<{ id: string }[]>`update public.event_resources set deleted_at = now(), updated_by = ${user.id}, updated_at = now() where id = ${resourceId} and event_id = ${eventId} and company_id = ${companyId} and deleted_at is null returning id`
    if (!rows[0]) throw new Error("Recurso não encontrado")
    await writeAuditLog({ action: "event.resource.delete", entityTable: "event_resources", entityId: resourceId, companyId, metadata: { eventId } })
    revalidatePath(`/eventos/${eventId}`)
    return { ok: true as const, id: rows[0].id }
  } catch (error) {
    return result(error)
  }
}

export async function createEventFollowUp(input: { eventId: string; personId: string; dueAt?: string; notes?: string }) {
  try {
    const parsed = z.object({ eventId: uuid, personId: uuid, dueAt: z.string().datetime({ offset: true }).optional(), notes: z.string().trim().max(5000).default("") }).parse({ ...input, notes: input.notes ?? "" })
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    const valid = await sql<{ id: string }[]>`select id from public.member_event_rsvps where event_id = ${parsed.eventId} and person_id = ${parsed.personId} and company_id = ${companyId} and status = 'going' limit 1`
    if (!valid[0]) throw new Error("Pessoa não está inscrita no evento")
    const sourceKey = `event:${parsed.eventId}:absent:${parsed.personId}`
    const rows = await sql<{ id: string }[]>`
      insert into public.person_follow_up_tasks(company_id, person_id, title, notes, due_at, priority, status, origin, source_key, created_by, updated_by)
      values (${companyId}, ${parsed.personId}, 'Acompanhar ausência em evento', ${parsed.notes}, ${parsed.dueAt ? new Date(parsed.dueAt).toISOString() : null}, 'normal', 'open', 'recurring_absence', ${sourceKey}, ${user.id}, ${user.id})
      on conflict (company_id, source_key) where source_key is not null and deleted_at is null
      do update set notes = excluded.notes, due_at = excluded.due_at, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `
    await writeAuditLog({ action: "event.follow_up.create", entityTable: "person_follow_up_tasks", entityId: rows[0]?.id, companyId, metadata: { eventId: parsed.eventId, personId: parsed.personId } })
    revalidatePath(`/eventos/${parsed.eventId}`)
    return { ok: true as const, id: rows[0]?.id }
  } catch (error) {
    return result(error)
  }
}

export async function scheduleEventCommunication(input: {
  eventId: string
  templateKey: string
  channel: "push" | "email" | "whatsapp"
  audience: "going" | "waitlist" | "guests" | "volunteers" | "ministry" | "public" | "all"
  title?: string
  content?: string
  scheduledAt?: string | null
}) {
  try {
    const parsed = z.object({
      eventId: uuid,
      templateKey: z.string().trim().min(2).max(80),
      channel: z.enum(["push", "email", "whatsapp"]),
      audience: z.enum(["going", "waitlist", "guests", "volunteers", "ministry", "public", "all"]),
      title: z.string().trim().min(2).max(200).optional(),
      content: z.string().trim().min(2).max(10000).optional(),
      scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    }).parse(input)
    const { user, companyId } = await managerContext("events.edit")
    const sql = getSql()
    const eventRows = await sql<{ id: string; title: string; starts_at: Date; location: string; public_token: string }[]>`
      select id, title, starts_at, location, public_token from public.events where id = ${parsed.eventId} and company_id = ${companyId} and deleted_at is null limit 1
    `
    const event = eventRows[0]
    if (!event) throw new Error("Evento não encontrado")
    const template = eventCommunicationTemplates.find((item) => item.key === parsed.templateKey)
    const title = parsed.title ?? template?.title ?? `Atualização: ${event.title}`
    const content = parsed.content ?? `${event.title}\n${new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(event.starts_at))}\n${event.location || "Local a confirmar"}`
    const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt).toISOString() : null
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now() - 60_000) throw new Error("Agendamento deve estar no futuro")

    const recipients = await sql.begin(async (tx) => {
      const memberRows = parsed.audience === "guests" ? [] : await tx<{ person_id: string; name: string; email: string | null; phone: string }[]>`
        select distinct person.id as person_id, person.full_name as name, person.email, person.phone
        from public.member_event_rsvps rsvp
        join public.people person on person.id = rsvp.person_id and person.company_id = rsvp.company_id and person.deleted_at is null and person.is_active
        where rsvp.company_id = ${companyId} and rsvp.event_id = ${parsed.eventId}
          and (
            (${parsed.audience === "waitlist" || parsed.audience === "all"} and rsvp.status = 'waitlisted')
            or (${parsed.audience === "going" || parsed.audience === "all" || parsed.audience === "public"} and rsvp.status = 'going')
            or (${parsed.audience === "ministry"} and exists (
              select 1 from public.events event_scope
              join public.ministry_memberships membership on membership.ministry_id = event_scope.ministry_id
                and membership.company_id = event_scope.company_id and membership.person_id = rsvp.person_id
                and membership.status = 'active' and membership.left_at is null
              where event_scope.id = ${parsed.eventId} and event_scope.ministry_id is not null
            ))
          )
        union
        select distinct person.id as person_id, person.full_name as name, person.email, person.phone
        from public.volunteer_assignments assignment
        join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id and volunteer.company_id = assignment.company_id and volunteer.deleted_at is null
        join public.people person on person.id = volunteer.person_id and person.company_id = volunteer.company_id and person.deleted_at is null and person.is_active
        join public.volunteer_shifts shift on shift.id = assignment.shift_id and shift.event_id = ${parsed.eventId}
        where assignment.company_id = ${companyId} and assignment.status not in ('declined', 'cancelled')
          and ${parsed.audience === "volunteers" || parsed.audience === "all"}
      `
      const guestRows = parsed.audience === "going" || parsed.audience === "volunteers" || parsed.audience === "ministry" ? [] : await tx<{ id: string; name: string; email: string; phone: string }[]>`
        select id, full_name as name, email, phone
        from public.event_guest_registrations
        where company_id = ${companyId} and event_id = ${parsed.eventId}
          and (
            (${parsed.audience === "waitlist" || parsed.audience === "all"} and status = 'waitlisted')
            or (${parsed.audience === "all" || parsed.audience === "public" || parsed.audience === "guests"} and status = 'going')
          )
      `
      const notificationRows = await tx<{ id: string }[]>`
        insert into public.notifications(
          company_id, title, content, method, type, target_group, scheduled_send, send_date,
          scheduled_at, audience_kind, audience_ref_id, audience_person_ids, snapshot_at, snapshot_count,
          status, created_by, updated_by, event_id, event_template_key
        ) values (
          ${companyId}, ${title}, ${content}, ${parsed.channel}, 'group', ${parsed.audience}, ${Boolean(scheduledAt)}, ${scheduledAt ? scheduledAt.slice(0, 10) : null},
          ${scheduledAt}, ${`event_${parsed.audience}`}, ${parsed.eventId}, ${tx.json(memberRows.map((row) => row.person_id))}, now(), 0,
          ${scheduledAt ? "scheduled" : "queued"}, ${user.id}, ${user.id}, ${parsed.eventId}, ${`${parsed.templateKey}:${parsed.channel}:${parsed.audience}`}
        ) returning id
      `
      const notificationId = notificationRows[0]?.id
      if (!notificationId) throw new Error("Campanha não foi criada")
      let deliveryCount = 0
      const nextAttempt = scheduledAt
      if (parsed.channel === "push") {
        const rows = await tx<{ id: string }[]>`
          insert into public.notification_deliveries(notification_id, company_id, person_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
          select ${notificationId}, subscription.company_id, subscription.person_id, 'push', subscription.endpoint, person.full_name, 'pending', coalesce(${nextAttempt}::timestamptz, now()), ${notificationId} || ':' || subscription.person_id::text || ':push:' || md5(subscription.endpoint)
          from public.notification_push_subscriptions subscription join public.people person on person.id = subscription.person_id and person.company_id = subscription.company_id
          where subscription.company_id = ${companyId} and subscription.is_active and subscription.person_id = any(${tx.array(memberRows.map((row) => row.person_id))}::uuid[])
            and not exists (select 1 from public.notification_channel_preferences preference where preference.company_id = subscription.company_id and preference.person_id = subscription.person_id and preference.channel = 'push' and preference.opted_out)
          on conflict (delivery_key) do nothing returning id
        `
        deliveryCount = rows.length
      } else if (parsed.channel === "email") {
        const memberIds = memberRows.map((row) => row.person_id)
        const memberDeliveries = await tx<{ id: string }[]>`
          insert into public.notification_deliveries(notification_id, company_id, person_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
          select ${notificationId}, person.company_id, person.id, 'email', lower(btrim(person.email)), person.full_name, 'pending', coalesce(${nextAttempt}::timestamptz, now()), ${notificationId} || ':' || person.id::text || ':email'
          from public.people person where person.company_id = ${companyId} and person.id = any(${tx.array(memberIds)}::uuid[]) and nullif(btrim(person.email), '') is not null
            and not exists (select 1 from public.notification_channel_preferences preference where preference.company_id = person.company_id and preference.person_id = person.id and preference.channel = 'email' and preference.opted_out)
          on conflict (delivery_key) do nothing returning id
        `
        const guestDeliveries = await tx<{ id: string }[]>`
          insert into public.notification_deliveries(notification_id, company_id, guest_registration_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
          select ${notificationId}, guest.company_id, guest.id, 'email', lower(btrim(guest.email)), guest.full_name, 'pending', coalesce(${nextAttempt}::timestamptz, now()), ${notificationId} || ':' || guest.id::text || ':email'
          from public.event_guest_registrations guest where guest.company_id = ${companyId} and guest.id = any(${tx.array(guestRows.map((row) => row.id))}::uuid[]) and nullif(btrim(guest.email), '') is not null
          on conflict (delivery_key) do nothing returning id
        `
        deliveryCount = memberDeliveries.length + guestDeliveries.length
      } else {
        const memberIds = memberRows.map((row) => row.person_id)
        const memberDeliveries = await tx<{ id: string }[]>`
          insert into public.notification_deliveries(notification_id, company_id, person_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
          select ${notificationId}, person.company_id, person.id, 'whatsapp', regexp_replace(person.phone, '\\D', '', 'g'), person.full_name, 'pending', coalesce(${nextAttempt}::timestamptz, now()), ${notificationId} || ':' || person.id::text || ':whatsapp'
          from public.people person where person.company_id = ${companyId} and person.id = any(${tx.array(memberIds)}::uuid[]) and length(regexp_replace(person.phone, '\\D', '', 'g')) >= 8
            and not exists (select 1 from public.notification_channel_preferences preference where preference.company_id = person.company_id and preference.person_id = person.id and preference.channel = 'whatsapp' and preference.opted_out)
          on conflict (delivery_key) do nothing returning id
        `
        const guestDeliveries = await tx<{ id: string }[]>`
          insert into public.notification_deliveries(notification_id, company_id, guest_registration_id, channel, recipient, recipient_name, status, next_attempt_at, delivery_key)
          select ${notificationId}, guest.company_id, guest.id, 'whatsapp', regexp_replace(guest.phone, '\\D', '', 'g'), guest.full_name, 'pending', coalesce(${nextAttempt}::timestamptz, now()), ${notificationId} || ':' || guest.id::text || ':whatsapp'
          from public.event_guest_registrations guest where guest.company_id = ${companyId} and guest.id = any(${tx.array(guestRows.map((row) => row.id))}::uuid[]) and length(regexp_replace(guest.phone, '\\D', '', 'g')) >= 8
          on conflict (delivery_key) do nothing returning id
        `
        deliveryCount = memberDeliveries.length + guestDeliveries.length
      }
      await tx`update public.notifications set snapshot_count = ${deliveryCount}, snapshot_at = now() where id = ${notificationId}`
      if (deliveryCount === 0) {
        await tx`delete from public.notifications where id = ${notificationId}`
      }
      return { notificationId, deliveryCount }
    })
    if (recipients.deliveryCount === 0) throw new Error("Nenhum participante possui contato ou assinatura compatível com este canal")
    await writeAuditLog({ action: "event.communication.schedule", entityTable: "notifications", entityId: recipients.notificationId, companyId, metadata: { eventId: parsed.eventId, templateKey: parsed.templateKey, audience: parsed.audience, channel: parsed.channel, deliveryCount: recipients.deliveryCount } })
    revalidatePath(`/eventos/${parsed.eventId}`)
    return { ok: true as const, id: recipients.notificationId, deliveryCount: recipients.deliveryCount }
  } catch (error) {
    return result(error)
  }
}
