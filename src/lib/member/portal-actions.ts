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
      const goingRows = await tx<{ count: number }[]>`
        select count(*)::integer as count from public.member_event_rsvps
        where event_id = ${eventId} and company_id = ${companyId} and status = 'going'
      `
      const goingCount = Number(goingRows[0]?.count ?? 0)
      const nextStatus = event.max_capacity !== null && goingCount >= event.max_capacity ? "waitlisted" : "going"
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
    const rows = await getSql()<{ id: string }[]>`
      update public.member_event_rsvps set status = 'canceled', updated_at = now()
      where event_id = ${eventId} and person_id = ${personId} and company_id = ${companyId}
        and status in ('going', 'waitlisted')
      returning id
    `
    if (!rows[0]) throw new Error("RSVP não encontrado")
    await writeAuditLog({ action: "member.event.rsvp.cancel", entityTable: "member_event_rsvps", entityId: rows[0].id, companyId, metadata: { eventId, personId, profileId: user.id } })
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
