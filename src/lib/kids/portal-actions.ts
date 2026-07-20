"use server"

import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { createClient } from "@/lib/supabase/server"
import { jsonbParam } from "@/lib/db/jsonb"
import type { IntegrationEventType } from "@/lib/integrations/types"
import { afterResponse } from "@/lib/performance/after-response"
import {
  KIDS_CONSENT_VERSION,
  guardianChildSchema,
  kidGuardianInputSchema,
  kidConsentUpdateSchema,
} from "./schemas"
import {
  buildCheckoutRequestedPayload,
  buildChildRegisteredPayload,
} from "./events"
import {
  generatePickupPin,
  generatePickupToken,
  hashPickupPin,
  hashPickupToken,
} from "./security"
import { buildQrPayload } from "./printing"
import { encryptHealthDetails } from "./security"
import { getGuardianKidIds, requireGuardianUser } from "./portal"
import type { KidConsentType, KidCustomFieldDefinition, KidsPortalActionResult } from "./types"
import { customValuesSchema, EMPTY_KID_ADDRESS, kidAddressSchema, splitFullName } from "./form-model"
import { listKidCustomFields, saveKidCustomValues, validateKidCustomValues } from "./custom-fields"

const CONSENT_TYPES: KidConsentType[] = ["data_processing", "image_use", "emergency_care", "communication"]

function failure(error: unknown): KidsPortalActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

function refresh() {
  revalidatePath("/membro/kids")
  revalidatePath("/kids/recepcao")
  revalidatePath("/kids")
}

async function emitKidsEvent(companyId: string, eventType: IntegrationEventType, eventKey: string, data: object) {
  try {
    const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
    await enqueueIntegrationEventSafe({ companyId, eventType, eventKey, data: { ...data } })
    afterResponse("integration outbox", async () => {
      const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
      await processIntegrationOutbox(25)
    })
  } catch {
    /* integrações são best-effort por contrato */
  }
}

/** Rate limit por empresa+janela horária usando a tabela compartilhada de registros públicos. */
async function checkRateLimit(companyId: string, key: string, limit: number): Promise<boolean> {
  const sql = getSql()
  const keyHash = createHash("sha256").update(`kids:${companyId}:${key}`).digest("hex")
  const rows = await sql<{ submission_count: number }[]>`
    insert into public.public_registration_rate_limits (company_id, ip_hash, window_start, submission_count)
    values (${companyId}, ${keyHash}, date_trunc('hour', now()), 1)
    on conflict (company_id, ip_hash, window_start)
    do update set submission_count = public.public_registration_rate_limits.submission_count + 1
    returning submission_count
  `
  return Number(rows[0]?.submission_count ?? 1) <= limit
}

async function clientKey(): Promise<string> {
  const headerStore = await headers()
  const forwarded = headerStore.get("x-forwarded-for") ?? ""
  return forwarded.split(",")[0]?.trim() || "desconhecido"
}

// ---------------------------------------------------------------------------
// Login familiar por código (OTP) — sem vazar existência de cadastro
// ---------------------------------------------------------------------------

const emailSchema = z.string().trim().email("E-mail inválido").max(160)

export async function requestFamilyLoginCode(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const email = emailSchema.parse(input).toLowerCase()
    const sql = getSql()

    // Só envia código quando há vínculo de responsável com esse e-mail.
    const links = await sql<{ company_id: string }[]>`
      select guardian.company_id
      from public.kid_guardians guardian
      join public.people person on person.id = guardian.person_id and person.deleted_at is null
      where guardian.deleted_at is null
        and person.email is not null
        and lower(person.email) = ${email}
      limit 1
    `
    const companyId = links[0]?.company_id ?? null

    if (companyId) {
      const ip = await clientKey()
      const allowed = await checkRateLimit(companyId, `otp:${ip}:${email}`, 5)
      if (!allowed) {
        return { ok: false, error: "Muitas tentativas. Aguarde uma hora e tente novamente." }
      }
      const supabase = await createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      })
      if (error) {
        return { ok: false, error: "Não foi possível enviar o código agora. Tente novamente." }
      }
    }

    // Mesma resposta para e-mails sem vínculo (anti-enumeração).
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function verifyFamilyLoginCode(input: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = z
      .object({ email: emailSchema, code: z.string().trim().regex(/^\d{6,8}$/, "Código inválido") })
      .parse(input)
    const email = parsed.email.toLowerCase()
    const sql = getSql()

    const links = await sql<{ company_id: string }[]>`
      select guardian.company_id
      from public.kid_guardians guardian
      join public.people person on person.id = guardian.person_id and person.deleted_at is null
      where guardian.deleted_at is null
        and person.email is not null
        and lower(person.email) = ${email}
      limit 1
    `
    const companyId = links[0]?.company_id ?? null
    if (companyId) {
      const ip = await clientKey()
      const allowed = await checkRateLimit(companyId, `otp-verify:${ip}:${email}`, 10)
      if (!allowed) {
        return { ok: false, error: "Muitas tentativas. Aguarde uma hora e tente novamente." }
      }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: parsed.code,
      type: "email",
    })
    if (error) {
      return { ok: false, error: "Código inválido ou expirado. Peça um novo código." }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function signOutFamily(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/familia")
}

// ---------------------------------------------------------------------------
// Contexto do responsável autenticado
// ---------------------------------------------------------------------------

async function guardianContext() {
  const user = await requireGuardianUser()
  if (!user.churchId) throw new Error("Igreja obrigatória")
  const kidIds = await getGuardianKidIds(user.id)
  return { user, companyId: user.churchId, kidIds }
}

function assertOwnsKid(kidIds: string[], kidId: string) {
  if (!kidIds.includes(kidId)) throw new Error("Acesso negado")
}

// ---------------------------------------------------------------------------
// Cadastro dos filhos pelo responsável
// ---------------------------------------------------------------------------

export async function saveGuardianChild(input: z.input<typeof guardianChildSchema>): Promise<KidsPortalActionResult> {
  try {
    const parsed = guardianChildSchema.parse(input)
    const { user, companyId, kidIds } = await guardianContext()
    if (parsed.id) assertOwnsKid(kidIds, parsed.id)

    const sql = getSql()
    const { fullName, firstName, lastName } = splitFullName(parsed.fullName)
    const customFields = await listKidCustomFields(companyId, { surface: "portal" })
    const customValues = validateKidCustomValues(customFields, "child", "portal", parsed.customValues)

    const details = {
      allergies: parsed.health.allergies,
      dietaryRestrictions: parsed.health.dietaryRestrictions,
      medication: parsed.health.medication,
      specialNeeds: parsed.health.specialNeeds,
      instructions: parsed.health.instructions,
    }
    const hasDetails = Object.values(details).some((value) => value.trim().length > 0)
    const detailsEncrypted = hasDetails ? encryptHealthDetails(JSON.stringify(details)) : ""

    // Responsável autenticado = vínculo principal com a própria conta.
    const guardianPerson = await sql<{ id: string }[]>`
      select id from public.people
      where profile_id = ${user.id} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    if (!guardianPerson[0]?.id) throw new Error("Seu cadastro de responsável não foi encontrado")
    const guardianPersonId = guardianPerson[0].id

    const saved = await sql.begin(async (tx) => {
      let personId = parsed.personId
      if (personId) {
        const owned = await tx<{ id: string }[]>`
          select kid.id from public.kid_profiles kid
          join public.kid_guardians guardian on guardian.kid_id = kid.id and guardian.deleted_at is null
          where kid.person_id = ${personId} and kid.company_id = ${companyId} and kid.deleted_at is null
            and guardian.profile_id = ${user.id}
          limit 1
        `
        if (!owned[0]?.id) throw new Error("Acesso negado")
        await tx`
          update public.people
          set first_name = ${firstName}, last_name = ${lastName}, full_name = ${fullName},
              birth_date = ${parsed.birthDate},
              congregation_id = coalesce(${parsed.congregationId}, congregation_id),
              updated_by = ${user.id}
          where id = ${personId} and company_id = ${companyId} and deleted_at is null
        `
      } else {
        const inserted = await tx<{ id: string }[]>`
          insert into public.people (
            company_id, congregation_id, first_name, last_name, full_name, birth_date,
            status, person_type, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.congregationId}, ${firstName}, ${lastName}, ${fullName},
            ${parsed.birthDate}, 'active', ${parsed.isVisitor ? "visitor" : "member"}, true, ${user.id}, ${user.id}
          )
          returning id
        `
        personId = inserted[0]?.id ?? null
      }
      if (!personId) throw new Error("Criança não foi salva")
      await saveKidCustomValues(tx, companyId, personId, user.id, customValues)

      const kidRows = await tx<{ id: string }[]>`
        insert into public.kid_profiles (company_id, person_id, status, is_visitor, notes, created_by, updated_by)
        values (${companyId}, ${personId}, 'active', ${parsed.isVisitor}, ${parsed.notes}, ${user.id}, ${user.id})
        on conflict (person_id) where deleted_at is null
        do update set is_visitor = excluded.is_visitor, notes = excluded.notes, updated_by = excluded.updated_by
        returning id
      `
      const resolvedKidId = kidRows[0]?.id
      if (!resolvedKidId) throw new Error("Criança não foi salva")

      // Vínculo do próprio responsável (sempre principal, com acesso total).
      await tx`
        insert into public.kid_guardians (
          company_id, kid_id, person_id, profile_id, relationship, is_primary,
          can_checkin, can_checkout, is_emergency_contact, whatsapp_enabled, email_enabled, created_by, updated_by
        )
        values (
          ${companyId}, ${resolvedKidId}, ${guardianPersonId}, ${user.id}, 'guardian', true,
          true, true, true, true, true, ${user.id}, ${user.id}
        )
        on conflict (kid_id, person_id) where deleted_at is null
        do update set profile_id = excluded.profile_id, is_primary = true, updated_by = excluded.updated_by
      `

      await tx`
        insert into public.kid_health_profiles (
          company_id, kid_id, has_allergy, has_dietary_restriction, has_medication, has_special_needs,
          details_encrypted, details_updated_at, details_updated_by, created_by, updated_by
        )
        values (
          ${companyId}, ${resolvedKidId}, ${parsed.health.hasAllergy}, ${parsed.health.hasDietaryRestriction},
          ${parsed.health.hasMedication}, ${parsed.health.hasSpecialNeeds},
          ${detailsEncrypted}, ${hasDetails ? new Date() : null}, ${hasDetails ? user.id : null}, ${user.id}, ${user.id}
        )
        on conflict (kid_id) where deleted_at is null
        do update set
          has_allergy = excluded.has_allergy,
          has_dietary_restriction = excluded.has_dietary_restriction,
          has_medication = excluded.has_medication,
          has_special_needs = excluded.has_special_needs,
          details_encrypted = excluded.details_encrypted,
          details_updated_at = excluded.details_updated_at,
          details_updated_by = excluded.details_updated_by,
          updated_by = excluded.updated_by
      `

      return { kidId: resolvedKidId, personId }
    })

    if (!parsed.id) {
      await emitKidsEvent(
        companyId,
        "kids.child.registered",
        `kids.child.registered:${saved.kidId}`,
        buildChildRegisteredPayload({ kidId: saved.kidId, personId: saved.personId, childFullName: fullName, isVisitor: parsed.isVisitor }),
      )
    }
    refresh()
    return { ok: true, id: saved.kidId, personId: saved.personId, guardianPersonIds: [guardianPersonId], createdPerson: !parsed.id }
  } catch (error) {
    return failure(error)
  }
}

const guardianProfileSchema = z.object({
  address: kidAddressSchema,
  customValues: customValuesSchema,
})

export async function saveGuardianKidsProfile(input: z.input<typeof guardianProfileSchema>): Promise<KidsPortalActionResult> {
  try {
    const parsed = guardianProfileSchema.parse(input)
    const user = await requireGuardianUser()
    if (!user.churchId) throw new Error("Acesso negado")
    const companyId = user.churchId
    const definitions = await listKidCustomFields(companyId, { surface: "portal" })
    const customValues = validateKidCustomValues(definitions, "guardian", "portal", parsed.customValues)
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      select id from public.people
      where profile_id = ${user.id} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    const personId = rows[0]?.id
    if (!personId) throw new Error("Cadastro do responsável não encontrado")
    await sql.begin(async (tx) => {
      await tx`
        update public.people set
          postal_code = ${parsed.address.postalCode}, address = ${parsed.address.street},
          address_number = ${parsed.address.number}, address_complement = ${parsed.address.complement},
          neighborhood = ${parsed.address.neighborhood}, city = ${parsed.address.city},
          state = ${parsed.address.state}, country = ${parsed.address.country}, updated_by = ${user.id}
        where id = ${personId} and company_id = ${companyId} and deleted_at is null
      `
      await saveKidCustomValues(tx, companyId, personId, user.id, customValues)
    })
    refresh()
    return { ok: true, id: personId }
  } catch (error) {
    return failure(error)
  }
}

export async function updateGuardianConsents(input: z.input<typeof kidConsentUpdateSchema>): Promise<KidsPortalActionResult> {
  try {
    const parsed = kidConsentUpdateSchema.parse(input)
    const { user, companyId, kidIds } = await guardianContext()
    assertOwnsKid(kidIds, parsed.kidId)
    const sql = getSql()

    await sql.begin(async (tx) => {
      for (const type of CONSENT_TYPES) {
        const wanted = parsed.consents.includes(type)
        const current = await tx<{ id: string; version: string }[]>`
          select id, version from public.kid_consents
          where kid_id = ${parsed.kidId} and company_id = ${companyId} and consent_type = ${type} and status = 'granted'
          limit 1
        `
        const currentRow = current[0]
        if (wanted && currentRow?.version === KIDS_CONSENT_VERSION) continue
        if (currentRow) {
          await tx`
            update public.kid_consents
            set status = 'revoked', revoked_at = now(), actor_profile_id = ${user.id}
            where id = ${currentRow.id}
          `
        }
        if (wanted) {
          await tx`
            insert into public.kid_consents (company_id, kid_id, consent_type, version, status, source, actor_profile_id)
            values (${companyId}, ${parsed.kidId}, ${type}, ${KIDS_CONSENT_VERSION}, 'granted', 'portal', ${user.id})
          `
        }
      }
    })

    refresh()
    return { ok: true, id: parsed.kidId }
  } catch (error) {
    return failure(error)
  }
}

/** Pessoas autorizadas (contatos) gerenciadas pelo responsável. */
export async function saveGuardianContact(input: unknown): Promise<KidsPortalActionResult> {
  try {
    const parsed = z
      .object({
        kidId: z.string().uuid(),
        contact: kidGuardianInputSchema,
      })
      .parse(input)
    const { user, companyId, kidIds } = await guardianContext()
    assertOwnsKid(kidIds, parsed.kidId)
    const sql = getSql()

    const contactName = splitFullName(parsed.contact.fullName)
    const fullName = contactName.fullName
    const digits = parsed.contact.phone.replace(/\D/g, "")

    let personId = parsed.contact.personId
    if (!personId && digits.length >= 8) {
      const existing = await sql<{ id: string }[]>`
        select id from public.people
        where company_id = ${companyId} and deleted_at is null
          and regexp_replace(phone, '\D', '', 'g') = ${digits}
        order by created_at
        limit 1
      `
      personId = existing[0]?.id ?? null
    }
    if (!personId && parsed.contact.email) {
      const existing = await sql<{ id: string }[]>`
        select id from public.people
        where company_id = ${companyId} and deleted_at is null
          and email is not null and lower(email) = lower(${parsed.contact.email})
        order by created_at
        limit 1
      `
      personId = existing[0]?.id ?? null
    }
    if (!personId) {
      const inserted = await sql<{ id: string }[]>`
        insert into public.people (company_id, first_name, last_name, full_name, email, phone, status, person_type, is_active, created_by, updated_by)
        values (${companyId}, ${contactName.firstName}, ${contactName.lastName}, ${fullName}, ${parsed.contact.email}, ${parsed.contact.phone}, 'active', 'attendee', true, ${user.id}, ${user.id})
        returning id
      `
      personId = inserted[0]?.id ?? null
    }
    if (!personId) throw new Error("Contato não foi salvo")

    // Contato nunca é principal nem substitui o vínculo do próprio responsável.
    const rows = await sql<{ id: string }[]>`
      insert into public.kid_guardians (
        company_id, kid_id, person_id, relationship, is_primary, can_checkin, can_checkout,
        is_emergency_contact, whatsapp_enabled, email_enabled, created_by, updated_by
      )
      values (
        ${companyId}, ${parsed.kidId}, ${personId}, ${parsed.contact.relationship}, false,
        ${parsed.contact.canCheckin}, ${parsed.contact.canCheckout}, ${parsed.contact.isEmergencyContact},
        ${parsed.contact.whatsappEnabled}, ${parsed.contact.emailEnabled}, ${user.id}, ${user.id}
      )
      on conflict (kid_id, person_id) where deleted_at is null
      do update set
        relationship = excluded.relationship,
        can_checkin = excluded.can_checkin,
        can_checkout = excluded.can_checkout,
        is_emergency_contact = excluded.is_emergency_contact,
        whatsapp_enabled = excluded.whatsapp_enabled,
        email_enabled = excluded.email_enabled,
        updated_by = excluded.updated_by
      returning id
    `

    refresh()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteGuardianContact(input: unknown): Promise<KidsPortalActionResult> {
  try {
    const parsed = z.object({ kidId: z.string().uuid(), guardianLinkId: z.string().uuid() }).parse(input)
    const { user, companyId, kidIds } = await guardianContext()
    assertOwnsKid(kidIds, parsed.kidId)
    const sql = getSql()

    // Nunca remove o vínculo da própria conta autenticada.
    const rows = await sql<{ id: string }[]>`
      update public.kid_guardians
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${parsed.guardianLinkId}
        and kid_id = ${parsed.kidId}
        and company_id = ${companyId}
        and deleted_at is null
        and (profile_id is null or profile_id <> ${user.id})
      returning id
    `
    if (!rows[0]?.id) throw new Error("Vínculo não encontrado (você não pode remover a si mesmo)")

    refresh()
    return { ok: true, id: parsed.guardianLinkId }
  } catch (error) {
    return failure(error)
  }
}

// ---------------------------------------------------------------------------
// Retirada: QR/PIN no portal e solicitação de checkout
// ---------------------------------------------------------------------------

export async function generateGuardianPickupCode(input: unknown): Promise<KidsPortalActionResult> {
  try {
    const attendanceId = z.string().uuid().parse(input)
    const { user, companyId, kidIds } = await guardianContext()
    const sql = getSql()

    const rows = await sql<{ id: string; kid_id: string; pin_rotation_minutes: number | null }[]>`
      select a.id, a.kid_id,
        (select pin_rotation_minutes from public.kid_settings s
          where s.company_id = a.company_id and s.congregation_id is null
          limit 1) as pin_rotation_minutes
      from public.kid_attendances a
      join public.kid_sessions session on session.id = a.session_id and session.deleted_at is null and session.status = 'open'
      where a.id = ${attendanceId}
        and a.company_id = ${companyId}
        and a.status in ('checked_in', 'checkout_requested')
      limit 1
    `
    const attendance = rows[0]
    if (!attendance) throw new Error("Presença não encontrada ou sessão encerrada")
    assertOwnsKid(kidIds, attendance.kid_id)

    // Somente responsável com autorização de retirada gera o código.
    const authorized = await sql<{ id: string }[]>`
      select guardian.id from public.kid_guardians guardian
      where guardian.kid_id = ${attendance.kid_id}
        and guardian.profile_id = ${user.id}
        and guardian.can_checkout = true
        and guardian.deleted_at is null
      limit 1
    `
    const guardianId = authorized[0]?.id
    if (!guardianId) throw new Error("Você não está autorizado(a) a retirar esta criança")

    const pickupToken = generatePickupToken()
    const pickupPin = generatePickupPin()
    const rotationMinutes = attendance.pin_rotation_minutes ?? 30
    const pinExpiresAt = new Date(Date.now() + rotationMinutes * 60_000)

    await sql.begin(async (tx) => {
      await tx`
        update public.kid_pickup_credentials
        set status = 'revoked', revoked_at = now()
        where attendance_id = ${attendance.id} and status = 'active'
      `
      await tx`
        insert into public.kid_pickup_credentials (company_id, attendance_id, kid_id, guardian_id, token_hash, pin_hash, pin_expires_at, rotation_count)
        values (${companyId}, ${attendance.id}, ${attendance.kid_id}, ${guardianId}, ${hashPickupToken(pickupToken)}, ${hashPickupPin(attendance.id, pickupPin)}, ${pinExpiresAt}, 1)
      `
      await tx`
        insert into public.kid_access_events (company_id, session_id, kid_id, attendance_id, event_type, actor_profile_id, metadata)
        select a.company_id, a.session_id, a.kid_id, a.id, 'credential_rotated', ${user.id}, ${jsonbParam(sql, { origin: "portal" })}
        from public.kid_attendances a where a.id = ${attendance.id}
      `
    })

    return {
      ok: true,
      id: attendance.id,
      pickupCode: {
        qrPayload: buildQrPayload(pickupToken),
        pin: pickupPin,
        expiresAt: pinExpiresAt.toISOString(),
      },
    }
  } catch (error) {
    return failure(error)
  }
}

export async function requestGuardianCheckout(input: unknown): Promise<KidsPortalActionResult> {
  try {
    const attendanceId = z.string().uuid().parse(input)
    const { user, companyId } = await guardianContext()
    const sql = getSql()

    const rows = await sql<{ id: string; kid_id: string; session_id: string }[]>`
      update public.kid_attendances attendance
      set status = 'checkout_requested', checkout_requested_at = now(), checkout_requested_by = ${user.id}
      where attendance.id = ${attendanceId}
        and attendance.company_id = ${companyId}
        and attendance.status = 'checked_in'
        and exists (
          select 1 from public.kid_guardians guardian
          where guardian.kid_id = attendance.kid_id
            and guardian.profile_id = ${user.id}
            and guardian.can_checkout = true
            and guardian.deleted_at is null
        )
      returning attendance.id, attendance.kid_id, attendance.session_id
    `
    const row = rows[0]
    if (!row) throw new Error("Presença não encontrada ou retirada já solicitada")

    await emitKidsEvent(
      companyId,
      "kids.checkout.requested",
      `kids.checkout.requested:${row.id}:${Date.now()}`,
      buildCheckoutRequestedPayload({
        attendanceId: row.id,
        sessionId: row.session_id,
        kidId: row.kid_id,
        requestedBy: "guardian",
        requestedAt: new Date().toISOString(),
      }),
    )
    refresh()
    return { ok: true, id: row.id }
  } catch (error) {
    return failure(error)
  }
}

// ---------------------------------------------------------------------------
// Cadastro rápido de visitante (público, /kids/cadastro/[slug])
// ---------------------------------------------------------------------------

const visitorSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Link inválido"),
  childFullName: z.string().trim().min(2, "Nome completo da criança obrigatório").transform((value) => value.replace(/\s+/g, " ")),
  childBirthDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
  guardianFullName: z.string().trim().min(2, "Seu nome completo é obrigatório").transform((value) => value.replace(/\s+/g, " ")),
  guardianPhone: z.string().trim().min(8, "Telefone obrigatório"),
  guardianEmail: z
    .union([z.string().trim().email("E-mail inválido"), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
  guardianAddress: kidAddressSchema.optional().default(EMPTY_KID_ADDRESS),
  childCustomValues: customValuesSchema,
  guardianCustomValues: customValuesSchema,
  relationship: z.enum(["father", "mother", "guardian", "grandparent", "relative", "other"]).default("guardian"),
  health: z
    .object({
      hasAllergy: z.boolean().default(false),
      hasDietaryRestriction: z.boolean().default(false),
      hasMedication: z.boolean().default(false),
      hasSpecialNeeds: z.boolean().default(false),
      allergies: z.string().trim().optional().default(""),
      dietaryRestrictions: z.string().trim().optional().default(""),
      medication: z.string().trim().optional().default(""),
      specialNeeds: z.string().trim().optional().default(""),
      instructions: z.string().trim().optional().default(""),
    })
    .optional(),
  consents: z.array(z.enum(["data_processing", "image_use", "emergency_care", "communication"])).default([]),
})

export async function registerVisitorKid(input: z.input<typeof visitorSchema>): Promise<KidsPortalActionResult> {
  try {
    const parsed = visitorSchema.parse(input)
    const sql = getSql()

    const companies = await sql<{ id: string; name: string }[]>`
      select id, name from public.companies
      where slug = ${parsed.slug} and active = true and status = 'active'
      limit 1
    `
    const company = companies[0]
    if (!company) throw new Error("Igreja não encontrada")

    // Módulo Kids precisa estar ativo e o formulário de visitante habilitado.
    const enabled = await sql<{ module_id: string }[]>`
      select module_id from public.company_enabled_modules
      where company_id = ${company.id} and module_id = 'kids'
      limit 1
    `
    if (!enabled[0]?.module_id) throw new Error("Cadastro indisponível no momento")

    const settingsRows = await sql<{ visitor_form_enabled: boolean; required_consent_types: string[] | null }[]>`
      select visitor_form_enabled, required_consent_types
      from public.kid_settings
      where company_id = ${company.id} and congregation_id is null
      limit 1
    `
    if (settingsRows[0] && !settingsRows[0].visitor_form_enabled) {
      throw new Error("Cadastro de visitante desabilitado. Faça o cadastro na recepção.")
    }
    const requiredConsents = (settingsRows[0]?.required_consent_types ?? ["data_processing", "emergency_care"]) as KidConsentType[]
    const missingConsents = requiredConsents.filter((type) => !parsed.consents.includes(type))
    if (missingConsents.length > 0) {
      throw new Error("Aceite os termos obrigatórios para concluir o cadastro")
    }

    const ip = await clientKey()
    const allowed = await checkRateLimit(company.id, `visitor:${ip}`, 8)
    if (!allowed) {
      return { ok: false, error: "Muitas tentativas. Aguarde uma hora e tente novamente." }
    }

    const childName = splitFullName(parsed.childFullName)
    const childFullName = childName.fullName
    const guardianName = splitFullName(parsed.guardianFullName)
    const guardianFullName = guardianName.fullName
    const guardianDigits = parsed.guardianPhone.replace(/\D/g, "")
    const customFields = await listKidCustomFields(company.id, { surface: "public" })
    const childCustomValues = validateKidCustomValues(customFields, "child", "public", parsed.childCustomValues)
    const guardianCustomValues = validateKidCustomValues(customFields, "guardian", "public", parsed.guardianCustomValues)

    const saved = await sql.begin(async (tx) => {
      // Responsável: dedup por telefone normalizado, depois e-mail.
      let guardianPersonId: string | null = null
      let createdGuardian = false
      if (guardianDigits.length >= 8) {
        const found = await tx<{ id: string }[]>`
          select id from public.people
          where company_id = ${company.id} and deleted_at is null
            and regexp_replace(phone, '\D', '', 'g') = ${guardianDigits}
          order by created_at
          limit 1
        `
        guardianPersonId = found[0]?.id ?? null
      }
      if (!guardianPersonId && parsed.guardianEmail) {
        const found = await tx<{ id: string }[]>`
          select id from public.people
          where company_id = ${company.id} and deleted_at is null
            and email is not null and lower(email) = lower(${parsed.guardianEmail})
          order by created_at
          limit 1
        `
        guardianPersonId = found[0]?.id ?? null
      }
      if (!guardianPersonId) {
        const inserted = await tx<{ id: string }[]>`
          insert into public.people (
            company_id, first_name, last_name, full_name, email, phone,
            postal_code, address, address_number, address_complement, neighborhood, city, state, country,
            status, person_type, is_active
          ) values (
            ${company.id}, ${guardianName.firstName}, ${guardianName.lastName}, ${guardianFullName}, ${parsed.guardianEmail}, ${parsed.guardianPhone},
            ${parsed.guardianAddress.postalCode}, ${parsed.guardianAddress.street}, ${parsed.guardianAddress.number},
            ${parsed.guardianAddress.complement}, ${parsed.guardianAddress.neighborhood}, ${parsed.guardianAddress.city},
            ${parsed.guardianAddress.state}, ${parsed.guardianAddress.country}, 'active', 'attendee', true
          )
          returning id
        `
        guardianPersonId = inserted[0]?.id ?? null
        createdGuardian = true
      }
      if (!guardianPersonId) throw new Error("Não foi possível concluir o cadastro")
      if (createdGuardian) await saveKidCustomValues(tx, company.id, guardianPersonId, null, guardianCustomValues)

      // Criança: dedup somente por nome+nascimento (vínculo final é decisão do operador).
      let childPersonId: string | null = null
      let createdPerson = false
      if (parsed.childBirthDate) {
        const found = await tx<{ id: string }[]>`
          select id from public.people
          where company_id = ${company.id} and deleted_at is null
            and lower(full_name) = lower(${childFullName})
            and birth_date = ${parsed.childBirthDate}
          order by created_at
          limit 1
        `
        childPersonId = found[0]?.id ?? null
      }
      if (!childPersonId) {
        const inserted = await tx<{ id: string }[]>`
          insert into public.people (company_id, first_name, last_name, full_name, birth_date, status, person_type, is_active)
          values (${company.id}, ${childName.firstName}, ${childName.lastName}, ${childFullName}, ${parsed.childBirthDate}, 'active', 'visitor', true)
          returning id
        `
        childPersonId = inserted[0]?.id ?? null
        createdPerson = true
      }
      if (!childPersonId) throw new Error("Não foi possível concluir o cadastro")
      if (createdPerson) await saveKidCustomValues(tx, company.id, childPersonId, null, childCustomValues)

      const kidRows = await tx<{ id: string }[]>`
        insert into public.kid_profiles (company_id, person_id, status, is_visitor)
        values (${company.id}, ${childPersonId}, 'active', true)
        on conflict (person_id) where deleted_at is null
        do update set is_visitor = true
        returning id
      `
      const resolvedKidId = kidRows[0]?.id
      if (!resolvedKidId) throw new Error("Não foi possível concluir o cadastro")

      await tx`
        insert into public.kid_guardians (
          company_id, kid_id, person_id, relationship, is_primary, can_checkin, can_checkout, is_emergency_contact
        )
        values (${company.id}, ${resolvedKidId}, ${guardianPersonId}, ${parsed.relationship}, true, true, true, true)
        on conflict (kid_id, person_id) where deleted_at is null
        do update set relationship = excluded.relationship
      `

      const health = parsed.health ?? {
        hasAllergy: false,
        hasDietaryRestriction: false,
        hasMedication: false,
        hasSpecialNeeds: false,
        allergies: "",
        dietaryRestrictions: "",
        medication: "",
        specialNeeds: "",
        instructions: "",
      }
      const details = {
        allergies: health.allergies,
        dietaryRestrictions: health.dietaryRestrictions,
        medication: health.medication,
        specialNeeds: health.specialNeeds,
        instructions: health.instructions,
      }
      const hasDetails = Object.values(details).some((value) => value.trim().length > 0)
      const detailsEncrypted = hasDetails ? encryptHealthDetails(JSON.stringify(details)) : ""
      await tx`
        insert into public.kid_health_profiles (
          company_id, kid_id, has_allergy, has_dietary_restriction, has_medication, has_special_needs, details_encrypted, details_updated_at
        )
        values (
          ${company.id}, ${resolvedKidId}, ${health.hasAllergy}, ${health.hasDietaryRestriction},
          ${health.hasMedication}, ${health.hasSpecialNeeds}, ${detailsEncrypted}, ${hasDetails ? new Date() : null}
        )
        on conflict (kid_id) where deleted_at is null
        do update set
          has_allergy = excluded.has_allergy,
          has_dietary_restriction = excluded.has_dietary_restriction,
          has_medication = excluded.has_medication,
          has_special_needs = excluded.has_special_needs,
          details_encrypted = excluded.details_encrypted,
          details_updated_at = excluded.details_updated_at
      `

      for (const type of CONSENT_TYPES) {
        if (!parsed.consents.includes(type)) continue
        const current = await tx<{ id: string; version: string }[]>`
          select id, version from public.kid_consents
          where kid_id = ${resolvedKidId} and consent_type = ${type} and status = 'granted'
          limit 1
        `
        if (current[0]?.version === KIDS_CONSENT_VERSION) continue
        if (current[0]) {
          await tx`update public.kid_consents set status = 'revoked', revoked_at = now() where id = ${current[0].id}`
        }
        await tx`
          insert into public.kid_consents (company_id, kid_id, consent_type, version, status, source)
          values (${company.id}, ${resolvedKidId}, ${type}, ${KIDS_CONSENT_VERSION}, 'granted', 'portal')
        `
      }

      return { kidId: resolvedKidId, personId: childPersonId, guardianPersonId, createdPerson, createdGuardian }
    })

    await emitKidsEvent(
      company.id,
      "kids.child.registered",
      `kids.child.registered:${saved.kidId}`,
      buildChildRegisteredPayload({ kidId: saved.kidId, personId: saved.personId, childFullName, isVisitor: true }),
    )
    return {
      ok: true,
      id: saved.kidId,
      personId: saved.personId,
      guardianPersonIds: [saved.guardianPersonId],
      createdPerson: saved.createdPerson,
      createdGuardian: saved.createdGuardian,
    }
  } catch (error) {
    return failure(error)
  }
}

/** Dados públicos mínimos para renderizar o formulário de visitante. */
export async function getVisitorFormInfo(input: unknown): Promise<{
  ok: boolean
  error?: string
  companyName?: string
  requiredConsents?: KidConsentType[]
  customFields?: KidCustomFieldDefinition[]
}> {
  try {
    const slug = z.string().trim().regex(/^[a-z0-9-]+$/).parse(input)
    const sql = getSql()
    const companies = await sql<{ id: string; name: string }[]>`
      select id, name from public.companies
      where slug = ${slug} and active = true and status = 'active'
      limit 1
    `
    const company = companies[0]
    if (!company) return { ok: false, error: "Igreja não encontrada" }
    const enabled = await sql<{ module_id: string }[]>`
      select module_id from public.company_enabled_modules
      where company_id = ${company.id} and module_id = 'kids'
      limit 1
    `
    if (!enabled[0]?.module_id) return { ok: false, error: "Cadastro indisponível no momento" }
    const settingsRows = await sql<{ visitor_form_enabled: boolean; required_consent_types: string[] | null }[]>`
      select visitor_form_enabled, required_consent_types
      from public.kid_settings
      where company_id = ${company.id} and congregation_id is null
      limit 1
    `
    if (settingsRows[0] && !settingsRows[0].visitor_form_enabled) {
      return { ok: false, error: "Cadastro de visitante desabilitado. Faça o cadastro na recepção." }
    }
    return {
      ok: true,
      companyName: company.name,
      requiredConsents: (settingsRows[0]?.required_consent_types ?? ["data_processing", "emergency_care"]) as KidConsentType[],
      customFields: await listKidCustomFields(company.id, { surface: "public" }),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}
