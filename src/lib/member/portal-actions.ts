"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { writeAuditLog } from "@/lib/auth/permissions"
import { requireMemberContext } from "./access"

const uuid = z.string().uuid()

function value(formData: FormData, key: string) {
  const raw = formData.get(key)
  return typeof raw === "string" ? raw.trim() : ""
}

export async function rsvpMemberEvent(formData: FormData) {
  try {
    const eventId = uuid.parse(value(formData, "eventId"))
    const { user, companyId, personId } = await requireMemberContext()
    const result = await getSql().begin(async (tx) => {
      const events = await tx<{ id: string; registration_enabled: boolean; max_capacity: number | null; status: string }[]>`
        select id, registration_enabled, max_capacity, status
        from public.events
        where id = ${eventId} and company_id = ${companyId} and deleted_at is null
        for update
      `
      const event = events[0]
      if (!event || !event.registration_enabled || ["canceled", "cancelled", "draft"].includes(event.status)) throw new Error("Evento não aceita RSVP")
      const existing = await tx<{ id: string; status: "going" | "waitlisted" | "canceled" }[]>`
        select id, status from public.member_event_rsvps
        where event_id = ${eventId} and person_id = ${personId} and company_id = ${companyId}
        for update
      `
      const goingRows = await tx<{ member_count: number; guest_count: number }[]>`
        select
          (select count(*)::integer from public.member_event_rsvps where event_id = ${eventId} and company_id = ${companyId} and status = 'going') as member_count,
          (select count(*)::integer from public.event_guest_registrations where event_id = ${eventId} and company_id = ${companyId} and status = 'going') as guest_count
      `
      const goingCount = Number(goingRows[0]?.member_count ?? 0) + Number(goingRows[0]?.guest_count ?? 0) - (existing[0]?.status === "going" ? 1 : 0)
      const nextStatus = event.max_capacity !== null && event.max_capacity > 0 && goingCount >= event.max_capacity ? "waitlisted" : "going"
      const rows = existing[0]
        ? await tx<{ id: string; status: "going" | "waitlisted" }[]>`
            update public.member_event_rsvps set status = ${nextStatus}, updated_at = now()
            where id = ${existing[0].id} and company_id = ${companyId}
            returning id, status
          `
        : await tx<{ id: string; status: "going" | "waitlisted" }[]>`
            insert into public.member_event_rsvps (company_id, event_id, person_id, status)
            values (${companyId}, ${eventId}, ${personId}, ${nextStatus})
            returning id, status
          `
      return rows[0]
    })
    if (!result) throw new Error("RSVP não foi salvo")
    await writeAuditLog({ action: "member.event.rsvp", entityTable: "member_event_rsvps", entityId: result.id, companyId, metadata: { eventId, personId, status: result.status, profileId: user.id } })
    revalidatePath("/membro/agenda")
    return { ok: true, status: result.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível confirmar presença" }
  }
}

export async function cancelMemberEventRsvp(formData: FormData) {
  try {
    const eventId = uuid.parse(value(formData, "eventId"))
    const { user, companyId, personId } = await requireMemberContext()
    const rows = await getSql().begin(async (tx) => {
      const canceled = await tx<{ id: string; event_id: string; status: string }[]>`
        update public.member_event_rsvps set status = 'canceled', updated_at = now()
        where event_id = ${eventId} and person_id = ${personId} and company_id = ${companyId}
          and status in ('going', 'waitlisted')
        returning id, event_id, status
      `
      if (!canceled[0]) throw new Error("RSVP não encontrado")
      const eventRows = await tx<{ max_capacity: number }[]>`select max_capacity from public.events where id = ${eventId} and company_id = ${companyId} for update`
      const capacity = Number(eventRows[0]?.max_capacity ?? 0)
      if (capacity > 0) {
        const goingRows = await tx<{ count: number }[]>`select count(*)::integer as count from public.member_event_rsvps where event_id = ${eventId} and company_id = ${companyId} and status = 'going'`
        const guestGoingRows = await tx<{ count: number }[]>`select count(*)::integer as count from public.event_guest_registrations where event_id = ${eventId} and company_id = ${companyId} and status = 'going'`
        if (Number(goingRows[0]?.count ?? 0) + Number(guestGoingRows[0]?.count ?? 0) < capacity) {
          const promoted = await tx<{ id: string }[]>`
            select id from public.member_event_rsvps
            where event_id = ${eventId} and company_id = ${companyId} and status = 'waitlisted'
            order by created_at, id limit 1 for update skip locked
          `
          if (promoted[0]) await tx`update public.member_event_rsvps set status = 'going', updated_at = now() where id = ${promoted[0].id}`
          else {
            const guestPromoted = await tx<{ id: string }[]>`
              select id from public.event_guest_registrations
              where event_id = ${eventId} and company_id = ${companyId} and status = 'waitlisted'
              order by created_at, id limit 1 for update skip locked
            `
            if (guestPromoted[0]) await tx`update public.event_guest_registrations set status = 'going', updated_at = now() where id = ${guestPromoted[0].id}`
          }
        }
      }
      return canceled[0]
    })
    await writeAuditLog({ action: "member.event.rsvp.cancel", entityTable: "member_event_rsvps", entityId: rows.id, companyId, metadata: { eventId, personId, profileId: user.id } })
    revalidatePath("/membro/agenda")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível cancelar RSVP" }
  }
}

export async function createMemberPrayerRequest(formData: FormData) {
  try {
    const message = value(formData, "message")
    if (message.length < 3 || message.length > 5000) throw new Error("Escreva um pedido de oração entre 3 e 5000 caracteres")
    const { user, companyId, personId } = await requireMemberContext()
    const rows = await getSql()<{ id: string }[]>`
      insert into public.prayer_requests (company_id, name, prayer_reason, message, status, is_active, user_id, created_by, updated_by)
      values (${companyId}, ${user.name}, 'Portal do membro', ${message}, 'open', true, ${user.id}, ${user.id}, ${user.id})
      returning id
    `
    await writeAuditLog({ action: "member.prayer.create", entityTable: "prayer_requests", entityId: rows[0]?.id, companyId, metadata: { personId, profileId: user.id } })
    revalidatePath("/membro/oracao")
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível registrar o pedido" }
  }
}

export async function updateMemberProfile(formData: FormData) {
  try {
    const email = value(formData, "email")
    if (email && !z.string().email().safeParse(email).success) throw new Error("E-mail inválido")
    const { user, companyId, personId } = await requireMemberContext()
    const rows = await getSql()<{ id: string }[]>`
      update public.people
      set email = ${email || null}, phone = ${value(formData, "phone")}, address = ${value(formData, "address")},
          address_number = ${value(formData, "addressNumber")}, address_complement = ${value(formData, "addressComplement")},
          neighborhood = ${value(formData, "neighborhood")}, city = ${value(formData, "city")}, state = ${value(formData, "state")},
          postal_code = ${value(formData, "postalCode")}, updated_by = ${user.id}, updated_at = now()
      where company_id = ${companyId} and deleted_at is null
        and (id = ${personId} or profile_id = ${user.id})
      returning id
    `
    if (!rows[0]) throw new Error("Perfil não encontrado")
    await writeAuditLog({ action: "member.profile.update", entityTable: "people", entityId: personId, companyId, metadata: { profileId: user.id, fields: ["email", "phone", "address"] } })
    revalidatePath("/membro/perfil")
    revalidatePath("/membro")
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Não foi possível atualizar o perfil" }
  }
}
