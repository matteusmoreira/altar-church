"use server"

import { revalidatePath } from "next/cache"
import type postgres from "postgres"
import { z } from "zod"
import { requireCompanyAccess, requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { jsonbParam } from "@/lib/db/jsonb"
import { createClient } from "@/lib/supabase/server"
import { hasPermission, type Permission, type User } from "@/lib/types"
import type { IntegrationEventType } from "@/lib/integrations/types"
import {
  KIDS_CONSENT_VERSION,
  kidCheckinSchema,
  kidCheckoutRequestSchema,
  kidCheckoutSchema,
  kidChildSchema,
  kidClassroomRuleSchema,
  kidClassroomSchema,
  kidConsentUpdateSchema,
  kidGuardianCallSchema,
  kidHealthUpdateSchema,
  kidIncidentSchema,
  kidCampaignSchema,
  kidLessonReportSchema,
  kidRotateCredentialSchema,
  kidSessionClassroomSchema,
  kidSessionSchema,
  kidSettingsSchema,
  kidStaffAssignmentSchema,
} from "./schemas"
import {
  encryptHealthDetails,
  formatChildLabelName,
  generatePickupPin,
  generatePickupToken,
  hashPickupPin,
  hashPickupToken,
  verifyPickupPin,
} from "./security"
import { ageMonthsAt, suggestClassroom, type SuggestCandidate } from "./suggest"
import { buildKidLabelModel, parseQrPayload } from "./printing"
import {
  buildCheckinCreatedPayload,
  buildCheckoutCompletedPayload,
  buildCheckoutRequestedPayload,
  buildChildRegisteredPayload,
  buildGuardianCalledPayload,
  buildIncidentCreatedPayload,
} from "./events"
import { getKidHealthDetails, resolveKidEffectiveSettings } from "./data"
import type {
  KidCheckinCandidate,
  KidConsentType,
  KidEffectiveSettings,
  KidHealthDetails,
  KidHealthIndicators,
  KidsActionResult,
  KidsCheckinResult,
  KidsCheckoutResult,
} from "./types"

const CONSENT_TYPES: KidConsentType[] = ["data_processing", "image_use", "emergency_care", "communication"]

function failure(error: unknown): KidsActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

async function context(permission: Permission) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await requirePermission(permission, companyId)
  return { user, companyId }
}

async function requireRecentAuthentication(maxAgeMinutes = 15) {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  const signedInAt = user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : Number.NaN
  if (error || !user || !Number.isFinite(signedInAt) || Date.now() - signedInAt > maxAgeMinutes * 60_000) {
    throw new Error("Faça login novamente antes de autorizar uma retirada excepcional")
  }
}

async function audit(action: string, entityTable: string, entityId: string, companyId: string, metadata: Record<string, unknown> = {}) {
  await writeAuditLog({ action, entityTable, entityId, companyId, metadata })
}

function refresh() {
  revalidatePath("/kids")
  revalidatePath("/kids/recepcao")
  revalidatePath("/dashboard")
}

/** Contexto autorizado quando mais de uma permissão habilita a ação (ex.: professor OU recepção). */
async function contextAny(permissions: Permission[]) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await requireCompanyAccess(companyId)
  if (!permissions.some((permission) => hasPermission(user.role, permission))) {
    throw new Error("Acesso negado")
  }
  return { user, companyId }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = error as { code?: string; constraint_name?: string } | null
  return pgError?.code === "23505" && (pgError.constraint_name ?? "").includes(constraint)
}

/** datetime-local sem fuso é interpretado como horário da igreja (America/Sao_Paulo). */
function parseLocalDateTime(value: string): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  const normalized = hasZone ? trimmed : `${trimmed}${trimmed.length === 16 ? ":00" : ""}-03:00`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

async function insertAccessEvent(
  tx: postgres.TransactionSql,
  input: {
    companyId: string
    sessionId?: string | null
    kidId?: string | null
    attendanceId?: string | null
    eventType: string
    actorProfileId?: string | null
    metadata?: Record<string, unknown>
  },
) {
  await tx`
    insert into public.kid_access_events (company_id, session_id, kid_id, attendance_id, event_type, actor_profile_id, metadata)
    values (
      ${input.companyId}, ${input.sessionId ?? null}, ${input.kidId ?? null}, ${input.attendanceId ?? null},
      ${input.eventType}, ${input.actorProfileId ?? null}, ${jsonbParam(getSql(), input.metadata ?? {})}
    )
  `
}

/** Emite evento externo (webhook outbound) sem nunca quebrar a operação principal. */
async function emitKidsEvent(companyId: string, eventType: IntegrationEventType, eventKey: string, data: object) {
  try {
    const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
    const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
    await enqueueIntegrationEventSafe({ companyId, eventType, eventKey, data: { ...data } })
    try {
      await processIntegrationOutbox(25)
    } catch {
      /* cron/worker SQL continua o despacho */
    }
  } catch {
    /* integrações são best-effort por contrato */
  }
}

/** Enfileira mensagem operacional (Uazapi/Resend) sem nunca quebrar a operação principal. */
async function enqueueOperationalSafe(input: {
  companyId: string
  kind: "checkin" | "checkout" | "guardian_call" | "lesson_report"
  kidId: string
  sessionId: string | null
  attendanceId: string | null
  vars: {
    childName?: string
    classroomName?: string
    sessionTitle?: string
    reason?: string
    reportTitle?: string
    time?: string
  }
  createdBy?: string | null
}) {
  try {
    const { enqueueOperationalMessage, processKidDeliveryOutbox } = await import("@/lib/kids/delivery")
    await enqueueOperationalMessage(input)
    try {
      await processKidDeliveryOutbox(25)
    } catch {
      /* worker/cron continua o despacho */
    }
  } catch {
    /* mensageria é best-effort por contrato */
  }
}

function timeNowPtBr(): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date())
}

/** Voluntário só atua em crianças da sala atribuída na sessão. */
async function assertVolunteerAttendanceAccess(user: User, companyId: string, attendanceId: string) {
  if (user.role !== "volunteer") return
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select assignment.id
    from public.kid_attendances attendance
    join public.kid_staff_assignments assignment
      on assignment.session_id = attendance.session_id
      and assignment.profile_id = ${user.id}
      and assignment.session_classroom_id = attendance.session_classroom_id
    where attendance.id = ${attendanceId}
      and attendance.company_id = ${companyId}
    limit 1
  `
  if (!rows[0]?.id) throw new Error("Acesso negado")
}

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "")
}

function fullNameOf(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.trim()
}

type Tx = postgres.TransactionSql

/** Localiza pessoa existente na empresa por id, telefone normalizado ou e-mail. */
async function findPersonId(
  tx: Tx,
  companyId: string,
  input: { personId?: string | null; fullName: string; birthDate?: string | null; phone?: string; email?: string | null },
): Promise<string | null> {
  if (input.personId) {
    const rows = await tx<{ id: string }[]>`
      select id from public.people
      where id = ${input.personId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    if (!rows[0]?.id) throw new Error("Pessoa vinculada não encontrada")
    return rows[0].id
  }

  const digits = input.phone ? phoneDigits(input.phone) : ""
  if (digits.length >= 8) {
    const rows = await tx<{ id: string }[]>`
      select id from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and regexp_replace(phone, '\D', '', 'g') = ${digits}
      order by created_at
      limit 1
    `
    if (rows[0]?.id) return rows[0].id
  }

  if (input.email) {
    const rows = await tx<{ id: string }[]>`
      select id from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and email is not null
        and lower(email) = lower(${input.email})
      order by created_at
      limit 1
    `
    if (rows[0]?.id) return rows[0].id
  }

  if (input.birthDate) {
    const rows = await tx<{ id: string }[]>`
      select id from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and lower(full_name) = lower(${input.fullName})
        and birth_date = ${input.birthDate}
      order by created_at
      limit 1
    `
    if (rows[0]?.id) return rows[0].id
  }

  return null
}

export async function saveKid(input: z.input<typeof kidChildSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidChildSchema.parse(input)
    const { user, companyId } = await context("kids.children.manage")
    const sql = getSql()
    const fullName = fullNameOf(parsed.firstName, parsed.lastName)

    // Apenas um responsável principal por criança.
    let primarySeen = false
    const guardians = parsed.guardians.map((guardian) => {
      if (guardian.isPrimary && !primarySeen) {
        primarySeen = true
        return guardian
      }
      return { ...guardian, isPrimary: false }
    })

    const details = {
      allergies: parsed.health.allergies,
      dietaryRestrictions: parsed.health.dietaryRestrictions,
      medication: parsed.health.medication,
      specialNeeds: parsed.health.specialNeeds,
      instructions: parsed.health.instructions,
    }
    const hasDetails = Object.values(details).some((value) => value.trim().length > 0)
    const detailsEncrypted = hasDetails ? encryptHealthDetails(JSON.stringify(details)) : ""

    const saved = await sql.begin(async (tx) => {
      const personId = await findPersonId(tx, companyId, {
        personId: parsed.personId,
        fullName,
        birthDate: parsed.birthDate,
      })

      if (personId) {
        await tx`
          update public.people
          set first_name = ${parsed.firstName},
              last_name = ${parsed.lastName},
              full_name = ${fullName},
              birth_date = ${parsed.birthDate},
              congregation_id = coalesce(${parsed.congregationId}, congregation_id),
              updated_by = ${user.id}
          where id = ${personId} and company_id = ${companyId} and deleted_at is null
        `
      }

      const resolvedPersonId = personId ?? (
        await tx<{ id: string }[]>`
          insert into public.people (
            company_id, congregation_id, first_name, last_name, full_name,
            birth_date, status, person_type, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.congregationId}, ${parsed.firstName}, ${parsed.lastName}, ${fullName},
            ${parsed.birthDate}, 'active', ${parsed.isVisitor ? "visitor" : "member"}, true, ${user.id}, ${user.id}
          )
          returning id
        `
      )[0].id

      const kidRows = await tx<{ id: string }[]>`
        insert into public.kid_profiles (company_id, person_id, status, is_visitor, notes, created_by, updated_by)
        values (${companyId}, ${resolvedPersonId}, 'active', ${parsed.isVisitor}, ${parsed.notes}, ${user.id}, ${user.id})
        on conflict (person_id) where deleted_at is null
        do update set is_visitor = excluded.is_visitor, notes = excluded.notes, updated_by = excluded.updated_by
        returning id
      `
      const resolvedKidId = kidRows[0]?.id
      if (!resolvedKidId) throw new Error("Criança não foi salva")

      // Saúde essencial: indicadores em claro, detalhes cifrados.
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

      // Consentimentos versionados: revoga vigente e grava nova versão quando necessário.
      for (const type of CONSENT_TYPES) {
        const wanted = parsed.consents.includes(type)
        const current = await tx<{ id: string; version: string }[]>`
          select id, version from public.kid_consents
          where kid_id = ${resolvedKidId} and consent_type = ${type} and status = 'granted'
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
            values (${companyId}, ${resolvedKidId}, ${type}, ${KIDS_CONSENT_VERSION}, 'granted', 'reception', ${user.id})
          `
        }
      }

      // Responsáveis: remove vínculos ausentes e faz upsert dos informados.
      const desiredPersonIds: string[] = []
      for (const guardian of guardians) {
        const guardianPersonId = await findPersonId(tx, companyId, {
          personId: guardian.personId,
          fullName: fullNameOf(guardian.firstName, guardian.lastName),
          phone: guardian.phone,
          email: guardian.email,
        })

        const resolvedGuardianPersonId = guardianPersonId ?? (
          await tx<{ id: string }[]>`
            insert into public.people (
              company_id, first_name, last_name, full_name, email, phone,
              status, person_type, is_active, created_by, updated_by
            )
            values (
              ${companyId}, ${guardian.firstName}, ${guardian.lastName},
              ${fullNameOf(guardian.firstName, guardian.lastName)}, ${guardian.email}, ${guardian.phone},
              'active', 'attendee', true, ${user.id}, ${user.id}
            )
            returning id
          `
        )[0].id

        desiredPersonIds.push(resolvedGuardianPersonId)

        await tx`
          insert into public.kid_guardians (
            company_id, kid_id, person_id, relationship, is_primary, can_checkin, can_checkout,
            is_emergency_contact, whatsapp_enabled, email_enabled, created_by, updated_by
          )
          values (
            ${companyId}, ${resolvedKidId}, ${resolvedGuardianPersonId}, ${guardian.relationship}, ${guardian.isPrimary},
            ${guardian.canCheckin}, ${guardian.canCheckout}, ${guardian.isEmergencyContact},
            ${guardian.whatsappEnabled}, ${guardian.emailEnabled}, ${user.id}, ${user.id}
          )
          on conflict (kid_id, person_id) where deleted_at is null
          do update set
            relationship = excluded.relationship,
            is_primary = excluded.is_primary,
            can_checkin = excluded.can_checkin,
            can_checkout = excluded.can_checkout,
            is_emergency_contact = excluded.is_emergency_contact,
            whatsapp_enabled = excluded.whatsapp_enabled,
            email_enabled = excluded.email_enabled,
            updated_by = excluded.updated_by
        `
      }

      await tx`
        update public.kid_guardians
        set deleted_at = now(), updated_by = ${user.id}
        where kid_id = ${resolvedKidId}
          and company_id = ${companyId}
          and deleted_at is null
          and person_id <> all (${desiredPersonIds}::uuid[])
      `

      return { kidId: resolvedKidId, personId: resolvedPersonId }
    })

    await audit("kids.child.save", "kid_profiles", saved.kidId, companyId, {
      isVisitor: parsed.isVisitor,
      guardians: guardians.length,
      consents: parsed.consents,
      healthAlerts: [
        parsed.health.hasAllergy ? "allergy" : null,
        parsed.health.hasMedication ? "medication" : null,
        parsed.health.hasSpecialNeeds ? "special_needs" : null,
      ].filter(Boolean),
    })
    if (!parsed.id) {
      await emitKidsEvent(
        companyId,
        "kids.child.registered",
        `kids.child.registered:${saved.kidId}`,
        buildChildRegisteredPayload({
          kidId: saved.kidId,
          personId: saved.personId,
          childFullName: fullName,
          isVisitor: parsed.isVisitor,
        }),
      )
    }
    refresh()
    return { ok: true, id: saved.kidId }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteKid(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.children.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      update public.kid_profiles
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Criança não encontrada")

    await sql`
      update public.kid_guardians
      set deleted_at = now(), updated_by = ${user.id}
      where kid_id = ${id} and company_id = ${companyId} and deleted_at is null
    `
    await sql`
      update public.kid_health_profiles
      set deleted_at = now(), updated_by = ${user.id}
      where kid_id = ${id} and company_id = ${companyId} and deleted_at is null
    `

    await audit("kids.child.delete", "kid_profiles", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function updateKidHealth(input: z.input<typeof kidHealthUpdateSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidHealthUpdateSchema.parse(input)
    const { user, companyId } = await context("kids.children.manage")
    const sql = getSql()

    const details = {
      allergies: parsed.health.allergies,
      dietaryRestrictions: parsed.health.dietaryRestrictions,
      medication: parsed.health.medication,
      specialNeeds: parsed.health.specialNeeds,
      instructions: parsed.health.instructions,
    }
    const hasDetails = Object.values(details).some((value) => value.trim().length > 0)
    const detailsEncrypted = hasDetails ? encryptHealthDetails(JSON.stringify(details)) : ""

    const rows = await sql<{ id: string }[]>`
      update public.kid_health_profiles
      set has_allergy = ${parsed.health.hasAllergy},
          has_dietary_restriction = ${parsed.health.hasDietaryRestriction},
          has_medication = ${parsed.health.hasMedication},
          has_special_needs = ${parsed.health.hasSpecialNeeds},
          details_encrypted = ${detailsEncrypted},
          details_updated_at = ${hasDetails ? new Date() : null},
          details_updated_by = ${hasDetails ? user.id : null},
          updated_by = ${user.id}
      where kid_id = ${parsed.kidId} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Perfil de saúde não encontrado")

    await audit("kids.health.save", "kid_health_profiles", rows[0].id, companyId, {
      kidId: parsed.kidId,
      hasDetails,
    })
    refresh()
    return { ok: true, id: parsed.kidId }
  } catch (error) {
    return failure(error)
  }
}

export async function updateKidConsents(input: z.input<typeof kidConsentUpdateSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidConsentUpdateSchema.parse(input)
    const { user, companyId } = await context("kids.children.manage")
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
            values (${companyId}, ${parsed.kidId}, ${type}, ${KIDS_CONSENT_VERSION}, 'granted', 'reception', ${user.id})
          `
        }
      }
    })

    await audit("kids.consent.save", "kid_consents", parsed.kidId, companyId, { consents: parsed.consents })
    refresh()
    return { ok: true, id: parsed.kidId }
  } catch (error) {
    return failure(error)
  }
}

export async function saveKidClassroom(input: z.input<typeof kidClassroomSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidClassroomSchema.parse(input)
    const { user, companyId } = await context("kids.classes.manage")
    const sql = getSql()

    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.kid_classrooms
          set congregation_id = ${parsed.congregationId},
              name = ${parsed.name},
              min_age_months = ${parsed.minAgeMonths},
              max_age_months = ${parsed.maxAgeMonths},
              capacity = ${parsed.capacity},
              location = ${parsed.location},
              is_active = ${parsed.isActive},
              updated_by = ${user.id}
          where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.kid_classrooms (
            company_id, congregation_id, name, min_age_months, max_age_months,
            capacity, location, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.congregationId}, ${parsed.name}, ${parsed.minAgeMonths}, ${parsed.maxAgeMonths},
            ${parsed.capacity}, ${parsed.location}, ${parsed.isActive}, ${user.id}, ${user.id}
          )
          returning id
        `
    if (!rows[0]?.id) throw new Error("Sala não foi salva")

    await audit("kids.classroom.save", "kid_classrooms", rows[0].id, companyId, { name: parsed.name })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteKidClassroom(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.classes.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      update public.kid_classrooms
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sala não encontrada")

    await audit("kids.classroom.delete", "kid_classrooms", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function saveKidClassroomRule(input: z.input<typeof kidClassroomRuleSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidClassroomRuleSchema.parse(input)
    const { user, companyId } = await context("kids.classes.manage")
    const sql = getSql()

    const classroom = await sql<{ id: string }[]>`
      select id from public.kid_classrooms
      where id = ${parsed.classroomId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    if (!classroom[0]?.id) throw new Error("Sala não encontrada")

    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.kid_classroom_rules
          set congregation_id = ${parsed.congregationId},
              weekday = ${parsed.weekday},
              start_time = ${parsed.startTime},
              end_time = ${parsed.endTime},
              min_age_months = ${parsed.minAgeMonths},
              max_age_months = ${parsed.maxAgeMonths},
              priority = ${parsed.priority},
              is_active = ${parsed.isActive},
              updated_by = ${user.id}
          where id = ${parsed.id} and company_id = ${companyId} and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.kid_classroom_rules (
            company_id, classroom_id, congregation_id, weekday, start_time, end_time,
            min_age_months, max_age_months, priority, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.classroomId}, ${parsed.congregationId}, ${parsed.weekday}, ${parsed.startTime},
            ${parsed.endTime}, ${parsed.minAgeMonths}, ${parsed.maxAgeMonths}, ${parsed.priority}, ${parsed.isActive},
            ${user.id}, ${user.id}
          )
          returning id
        `
    if (!rows[0]?.id) throw new Error("Regra não foi salva")

    await audit("kids.classroom_rule.save", "kid_classroom_rules", rows[0].id, companyId, { classroomId: parsed.classroomId })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteKidClassroomRule(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.classes.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      update public.kid_classroom_rules
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Regra não encontrada")

    await audit("kids.classroom_rule.delete", "kid_classroom_rules", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function saveKidSettings(input: z.input<typeof kidSettingsSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidSettingsSchema.parse(input)
    const { user, companyId } = await context("kids.settings.manage")
    const sql = getSql()

    // Upsert manual: índices únicos parciais distintos para padrão da empresa e por congregação.
    const existing = parsed.congregationId
      ? await sql<{ id: string }[]>`
          select id from public.kid_settings
          where company_id = ${companyId} and congregation_id = ${parsed.congregationId}
          limit 1
        `
      : await sql<{ id: string }[]>`
          select id from public.kid_settings
          where company_id = ${companyId} and congregation_id is null
          limit 1
        `

    const rows = existing[0]?.id
      ? await sql<{ id: string }[]>`
          update public.kid_settings
          set require_checkout_pin = ${parsed.requireCheckoutPin},
              pin_rotation_minutes = ${parsed.pinRotationMinutes},
              allow_capacity_override = ${parsed.allowCapacityOverride},
              label_paper = ${parsed.labelPaper},
              label_show_qr = ${parsed.labelShowQr},
              auto_print = ${parsed.autoPrint},
              visitor_form_enabled = ${parsed.visitorFormEnabled},
              required_consent_types = ${parsed.requiredConsentTypes},
              updated_by = ${user.id}
          where id = ${existing[0].id} and company_id = ${companyId}
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.kid_settings (
            company_id, congregation_id, require_checkout_pin, pin_rotation_minutes, allow_capacity_override,
            label_paper, label_show_qr, auto_print, visitor_form_enabled, required_consent_types,
            created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.congregationId}, ${parsed.requireCheckoutPin}, ${parsed.pinRotationMinutes},
            ${parsed.allowCapacityOverride}, ${parsed.labelPaper}, ${parsed.labelShowQr}, ${parsed.autoPrint},
            ${parsed.visitorFormEnabled}, ${parsed.requiredConsentTypes}, ${user.id}, ${user.id}
          )
          returning id
        `
    if (!rows[0]?.id) throw new Error("Configurações não foram salvas")

    await audit("kids.settings.save", "kid_settings", rows[0].id, companyId, {
      congregationId: parsed.congregationId,
    })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return failure(error)
  }
}

/** Detalhes clínicos para o formulário de edição (somente kids.health.view). Nunca logar o retorno. */
export async function fetchKidHealthDetails(input: unknown): Promise<{
  ok: boolean
  details?: KidHealthDetails & KidHealthIndicators
  error?: string
}> {
  try {
    const kidId = z.string().uuid().parse(input)
    const details = await getKidHealthDetails(kidId)
    return { ok: true, details }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

/** Busca pessoas da empresa para vincular como responsável (picker do formulário). */
export async function searchGuardianPeople(input: unknown): Promise<{ ok: boolean; people?: { id: string; fullName: string; phone: string; email: string | null }[]; error?: string }> {
  try {
    const query = z.string().trim().max(120).parse(input)
    const { companyId } = await context("kids.guardians.manage")
    if (query.length < 2) return { ok: true, people: [] }
    const sql = getSql()
    const like = `%${query.toLowerCase()}%`
    const rows = await sql<{ id: string; full_name: string; phone: string; email: string | null }[]>`
      select id, full_name, phone, email
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and (lower(full_name) like ${like} or lower(coalesce(email, '')) like ${like} or phone like ${`%${phoneDigits(query)}%`})
      order by full_name
      limit 10
    `
    return {
      ok: true,
      people: rows.map((row) => ({ id: row.id, fullName: row.full_name, phone: row.phone ?? "", email: row.email })),
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — sessões e escalas
// ---------------------------------------------------------------------------

export async function saveKidSession(input: z.input<typeof kidSessionSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidSessionSchema.parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const startsAt = parseLocalDateTime(parsed.startsAt)
    if (!startsAt) throw new Error("Início da sessão inválido")
    const endsAt = parsed.endsAt ? parseLocalDateTime(parsed.endsAt) : null
    if (parsed.endsAt && !endsAt) throw new Error("Término da sessão inválido")

    const sessionId = await sql.begin(async (tx) => {
      let resolvedId = parsed.id
      if (resolvedId) {
        const updated = await tx<{ id: string }[]>`
          update public.kid_sessions
          set title = ${parsed.title}, congregation_id = ${parsed.congregationId}, event_id = ${parsed.eventId},
              starts_at = ${startsAt}, ends_at = ${endsAt}, updated_by = ${user.id}
          where id = ${resolvedId} and company_id = ${companyId} and status = 'draft' and deleted_at is null
          returning id
        `
        if (!updated[0]?.id) throw new Error("Sessão não encontrada ou já aberta")
        await tx`delete from public.kid_session_classrooms where session_id = ${resolvedId}`
      } else {
        const inserted = await tx<{ id: string }[]>`
          insert into public.kid_sessions (company_id, title, congregation_id, event_id, starts_at, ends_at, status, created_by, updated_by)
          values (${companyId}, ${parsed.title}, ${parsed.congregationId}, ${parsed.eventId}, ${startsAt}, ${endsAt}, 'draft', ${user.id}, ${user.id})
          returning id
        `
        resolvedId = inserted[0]?.id ?? null
      }
      if (!resolvedId) throw new Error("Sessão não foi salva")

      // Salas da sessão: selecionadas ou, por padrão, todas as ativas da congregação (ou da empresa).
      let classroomIds = parsed.classroomIds
      if (classroomIds.length === 0) {
        const active = await tx<{ id: string }[]>`
          select id from public.kid_classrooms
          where company_id = ${companyId} and deleted_at is null and is_active = true
            and (${parsed.congregationId}::uuid is null or congregation_id = ${parsed.congregationId} or congregation_id is null)
          order by name
        `
        classroomIds = active.map((row) => row.id)
      }
      for (const [index, classroomId] of classroomIds.entries()) {
        await tx`
          insert into public.kid_session_classrooms (company_id, session_id, classroom_id, sort_order)
          values (${companyId}, ${resolvedId}, ${classroomId}, ${index})
          on conflict (session_id, classroom_id) do nothing
        `
      }
      return resolvedId
    })

    await audit("kids.session.save", "kid_sessions", sessionId, companyId, { title: parsed.title })
    refresh()
    return { ok: true, id: sessionId }
  } catch (error) {
    return failure(error)
  }
}

export async function openKidSession(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const classrooms = await sql<{ id: string }[]>`
      select id from public.kid_session_classrooms where session_id = ${id} and company_id = ${companyId} limit 1
    `
    if (!classrooms[0]?.id) throw new Error("Adicione ao menos uma sala antes de abrir a sessão")

    const rows = await sql<{ id: string }[]>`
      update public.kid_sessions
      set status = 'open', opened_at = now(), opened_by = ${user.id}, updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and status = 'draft' and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sessão não encontrada ou já aberta")

    await audit("kids.session.open", "kid_sessions", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function closeKidSession(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const active = await sql<{ count: number }[]>`
      select count(*)::int as count from public.kid_attendances
      where session_id = ${id} and company_id = ${companyId} and status in ('checked_in', 'checkout_requested')
    `
    const activeCount = Number(active[0]?.count ?? 0)
    if (activeCount > 0) {
      throw new Error(`Ainda há ${activeCount} criança(s) presente(s). Faça o checkout antes de encerrar.`)
    }

    const rows = await sql<{ id: string }[]>`
      update public.kid_sessions
      set status = 'closed', closed_at = now(), closed_by = ${user.id}, updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and status = 'open' and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sessão não encontrada ou não está aberta")

    await audit("kids.session.close", "kid_sessions", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function cancelKidSession(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const active = await sql<{ count: number }[]>`
      select count(*)::int as count from public.kid_attendances
      where session_id = ${id} and company_id = ${companyId} and status in ('checked_in', 'checkout_requested')
    `
    if (Number(active[0]?.count ?? 0) > 0) {
      throw new Error("Há crianças presentes; faça o checkout antes de cancelar")
    }

    const rows = await sql<{ id: string }[]>`
      update public.kid_sessions
      set status = 'cancelled', closed_at = now(), closed_by = ${user.id}, updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and status in ('draft', 'open') and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sessão não encontrada")

    await audit("kids.session.cancel", "kid_sessions", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteKidSession(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      update public.kid_sessions
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and status = 'draft' and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Somente sessões em rascunho podem ser excluídas")

    await audit("kids.session.delete", "kid_sessions", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function addKidSessionClassroom(input: z.input<typeof kidSessionClassroomSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidSessionClassroomSchema.parse(input)
    const { companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const sessions = await sql<{ status: string }[]>`
      select status from public.kid_sessions
      where id = ${parsed.sessionId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    if (!sessions[0] || !["draft", "open"].includes(sessions[0].status)) throw new Error("Sessão não encontrada ou encerrada")

    const classrooms = await sql<{ id: string }[]>`
      select id from public.kid_classrooms
      where id = ${parsed.classroomId} and company_id = ${companyId} and deleted_at is null and is_active = true
      limit 1
    `
    if (!classrooms[0]?.id) throw new Error("Sala não encontrada")

    const rows = await sql<{ id: string }[]>`
      insert into public.kid_session_classrooms (company_id, session_id, classroom_id, capacity_override)
      values (${companyId}, ${parsed.sessionId}, ${parsed.classroomId}, ${parsed.capacityOverride})
      on conflict (session_id, classroom_id) do nothing
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sala já está nesta sessão")

    await audit("kids.session_classroom.save", "kid_session_classrooms", rows[0].id, companyId, { sessionId: parsed.sessionId })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return failure(error)
  }
}

export async function removeKidSessionClassroom(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const used = await sql<{ id: string }[]>`
      select id from public.kid_attendances where session_classroom_id = ${id} limit 1
    `
    if (used[0]?.id) throw new Error("Sala já possui presenças registradas; não pode ser removida")

    const rows = await sql<{ id: string }[]>`
      delete from public.kid_session_classrooms
      where id = ${id} and company_id = ${companyId}
      returning id
    `
    if (!rows[0]?.id) throw new Error("Sala da sessão não encontrada")

    await audit("kids.session_classroom.delete", "kid_session_classrooms", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function saveKidStaffAssignment(input: z.input<typeof kidStaffAssignmentSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidStaffAssignmentSchema.parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const existing = await sql<{ id: string }[]>`
      select id from public.kid_staff_assignments
      where session_id = ${parsed.sessionId}
        and company_id = ${companyId}
        and profile_id = ${parsed.profileId}
        and session_classroom_id is not distinct from ${parsed.sessionClassroomId}
      limit 1
    `
    if (existing[0]?.id) throw new Error("Voluntário já escalado nesta sala")

    const rows = await sql<{ id: string }[]>`
      insert into public.kid_staff_assignments (company_id, session_id, session_classroom_id, profile_id, assignment_role, created_by, updated_by)
      values (${companyId}, ${parsed.sessionId}, ${parsed.sessionClassroomId}, ${parsed.profileId}, ${parsed.assignmentRole}, ${user.id}, ${user.id})
      returning id
    `
    if (!rows[0]?.id) throw new Error("Escala não foi salva")

    await audit("kids.staff.save", "kid_staff_assignments", rows[0].id, companyId, {
      sessionId: parsed.sessionId,
      profileId: parsed.profileId,
    })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteKidStaffAssignment(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      delete from public.kid_staff_assignments
      where id = ${id} and company_id = ${companyId}
      returning id
    `
    if (!rows[0]?.id) throw new Error("Escala não encontrada")

    await audit("kids.staff.delete", "kid_staff_assignments", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — recepção: busca, check-in, credencial e checkout
// ---------------------------------------------------------------------------

export async function searchKidsForCheckin(input: unknown): Promise<{ ok: boolean; candidates?: KidCheckinCandidate[]; error?: string }> {
  try {
    const parsed = z.object({ sessionId: z.string().uuid(), query: z.string().trim().max(120) }).parse(input)
    const { companyId } = await context("kids.checkin.create")
    if (parsed.query.length < 2) return { ok: true, candidates: [] }
    const sql = getSql()

    const sessions = await sql<{ id: string; congregation_id: string | null }[]>`
      select id, congregation_id from public.kid_sessions
      where id = ${parsed.sessionId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    const session = sessions[0]
    if (!session) throw new Error("Sessão não encontrada")
    const settings = await resolveKidEffectiveSettings(companyId, session.congregation_id)

    const like = `%${parsed.query.toLowerCase()}%`
    const digits = parsed.query.replace(/\D/g, "")
    const digitsLike = digits.length >= 2 ? `%${digits}%` : "%"

    const rows = await sql<{
      kid_id: string
      person_id: string
      full_name: string
      birth_date: Date | string | null
      congregation_id: string | null
      congregation_name: string | null
      is_visitor: boolean
      has_allergy: boolean | null
      has_dietary_restriction: boolean | null
      has_medication: boolean | null
      has_special_needs: boolean | null
      granted_consents: string[] | null
      guardians_summary: string | null
      active_attendance_id: string | null
      active_classroom_name: string | null
    }[]>`
      select
        kid.id as kid_id,
        kid.person_id,
        kid.is_visitor,
        p.full_name,
        p.birth_date,
        p.congregation_id,
        congregation.name as congregation_name,
        hp.has_allergy, hp.has_dietary_restriction, hp.has_medication, hp.has_special_needs,
        (select array_agg(consent.consent_type) from public.kid_consents consent
          where consent.kid_id = kid.id and consent.status = 'granted') as granted_consents,
        (select string_agg(guardian_person.full_name, ', ' order by guardian.is_primary desc, guardian_person.full_name)
          from public.kid_guardians guardian
          join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
          where guardian.kid_id = kid.id and guardian.deleted_at is null) as guardians_summary,
        (select attendance.id from public.kid_attendances attendance
          where attendance.session_id = ${parsed.sessionId} and attendance.kid_id = kid.id
            and attendance.status in ('checked_in', 'checkout_requested')
          limit 1) as active_attendance_id,
        (select attendance.classroom_name from public.kid_attendances attendance
          where attendance.session_id = ${parsed.sessionId} and attendance.kid_id = kid.id
            and attendance.status in ('checked_in', 'checkout_requested')
          limit 1) as active_classroom_name
      from public.kid_profiles kid
      join public.people p on p.id = kid.person_id and p.deleted_at is null
      left join public.congregations congregation on congregation.id = p.congregation_id
      left join public.kid_health_profiles hp on hp.kid_id = kid.id and hp.deleted_at is null
      where kid.company_id = ${companyId}
        and kid.deleted_at is null
        and kid.status = 'active'
        and (
          lower(p.full_name) like ${like}
          or exists (
            select 1 from public.kid_guardians guardian
            join public.people guardian_person on guardian_person.id = guardian.person_id and guardian_person.deleted_at is null
            where guardian.kid_id = kid.id and guardian.deleted_at is null
              and (
                lower(guardian_person.full_name) like ${like}
                or (${digits.length >= 2} and regexp_replace(guardian_person.phone, '\\D', '', 'g') like ${digitsLike})
              )
          )
        )
      order by p.first_name, p.full_name
      limit 12
    `

    const candidates: KidCheckinCandidate[] = rows.map((row) => {
      const granted = (row.granted_consents ?? []) as KidConsentType[]
      return {
        kidId: row.kid_id,
        personId: row.person_id,
        fullName: row.full_name,
        labelName: formatChildLabelName(row.full_name),
        ageMonths: ageMonthsAt(row.birth_date ? String(row.birth_date).slice(0, 10) : null),
        congregationId: row.congregation_id,
        congregationName: row.congregation_name,
        isVisitor: row.is_visitor,
        health: {
          hasAllergy: Boolean(row.has_allergy),
          hasDietaryRestriction: Boolean(row.has_dietary_restriction),
          hasMedication: Boolean(row.has_medication),
          hasSpecialNeeds: Boolean(row.has_special_needs),
        },
        missingConsents: settings.requiredConsentTypes.filter((type) => !granted.includes(type)),
        guardiansSummary: row.guardians_summary ?? "",
        activeAttendanceId: row.active_attendance_id,
        activeClassroomName: row.active_classroom_name,
      }
    })

    return { ok: true, candidates }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
  }
}

export async function checkinKid(input: z.input<typeof kidCheckinSchema>): Promise<KidsCheckinResult> {
  try {
    const parsed = kidCheckinSchema.parse(input)
    const { user, companyId } = await context("kids.checkin.create")
    const sql = getSql()

    let outcome: {
      attendanceId: string
      kidId: string
      childFullName: string
      classroomName: string
      sessionTitle: string
      pickupToken: string
      pickupPin: string
      capacityOverride: boolean
    }

    try {
      outcome = await sql.begin(async (tx) => {
        // Lock da sessão serializa check-ins e protege a contagem de capacidade.
        const sessions = await tx<{ id: string; title: string; status: string; congregation_id: string | null; starts_at: Date | string }[]>`
          select id, title, status, congregation_id, starts_at
          from public.kid_sessions
          where id = ${parsed.sessionId} and company_id = ${companyId} and deleted_at is null
          for update
        `
        const session = sessions[0]
        if (!session) throw new Error("Sessão não encontrada")
        if (session.status !== "open") throw new Error("Sessão não está aberta para check-in")

        const kids = await tx<{ id: string; status: string; full_name: string; birth_date: Date | string | null; congregation_id: string | null }[]>`
          select kid.id, kid.status, p.full_name, p.birth_date, p.congregation_id
          from public.kid_profiles kid
          join public.people p on p.id = kid.person_id and p.deleted_at is null
          where kid.id = ${parsed.kidId} and kid.company_id = ${companyId} and kid.deleted_at is null
          limit 1
        `
        const kid = kids[0]
        if (!kid) throw new Error("Criança não encontrada")
        if (kid.status !== "active") throw new Error("Cadastro da criança está inativo")

        const settingsRows = await tx<{
          congregation_id: string | null
          require_checkout_pin: boolean
          pin_rotation_minutes: number
          allow_capacity_override: boolean
          label_paper: string
          label_show_qr: boolean
          auto_print: boolean
          visitor_form_enabled: boolean
          required_consent_types: string[] | null
        }[]>`
          select * from public.kid_settings where company_id = ${companyId}
        `
        const settings = resolveSettingsFromRows(settingsRows, session.congregation_id ?? kid.congregation_id)

        // Consentimentos obrigatórios.
        const granted = await tx<{ consent_type: string }[]>`
          select consent_type from public.kid_consents
          where kid_id = ${kid.id} and company_id = ${companyId} and status = 'granted'
        `
        const missing = settings.requiredConsentTypes.filter(
          (type) => !granted.some((row) => row.consent_type === type),
        )
        if (missing.length > 0) {
          throw new Error(`Consentimentos pendentes: ${missing.join(", ")}`)
        }

        // Sala: escolha manual ou sugestão por regra/idade/capacidade.
        let sessionClassroomId = parsed.sessionClassroomId
        if (!sessionClassroomId) {
          const candidates = await tx<Record<string, unknown>[]>`
            select
              sc.id as "sessionClassroomId",
              sc.classroom_id as "classroomId",
              classroom.name,
              classroom.congregation_id as "congregationId",
              classroom.min_age_months as "minAgeMonths",
              classroom.max_age_months as "maxAgeMonths",
              coalesce(sc.capacity_override, classroom.capacity) as capacity,
              sc.is_open as "isOpen",
              (select count(*)::int from public.kid_attendances attendance
                where attendance.session_classroom_id = sc.id
                  and attendance.status in ('checked_in', 'checkout_requested')) as occupied,
              coalesce((
                select jsonb_agg(jsonb_build_object(
                  'congregationId', rule.congregation_id,
                  'weekday', rule.weekday,
                  'startTime', rule.start_time,
                  'endTime', rule.end_time,
                  'minAgeMonths', rule.min_age_months,
                  'maxAgeMonths', rule.max_age_months,
                  'priority', rule.priority,
                  'isActive', rule.is_active
                ))
                from public.kid_classroom_rules rule
                where rule.classroom_id = sc.classroom_id and rule.deleted_at is null
              ), '[]'::jsonb) as rules
            from public.kid_session_classrooms sc
            join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
            where sc.session_id = ${session.id}
          `
          const sessionStartsAt = session.starts_at instanceof Date ? session.starts_at : new Date(session.starts_at)
          const suggestion = suggestClassroom({
            ageMonths: ageMonthsAt(kid.birth_date ? String(kid.birth_date).slice(0, 10) : null, sessionStartsAt),
            congregationId: kid.congregation_id,
            at: sessionStartsAt,
            candidates: candidates.map((row) => ({
              sessionClassroomId: String(row.sessionClassroomId),
              classroomId: String(row.classroomId),
              name: String(row.name ?? ""),
              congregationId: row.congregationId ? String(row.congregationId) : null,
              minAgeMonths: Number(row.minAgeMonths ?? 0),
              maxAgeMonths: Number(row.maxAgeMonths ?? 216),
              capacity: Number(row.capacity ?? 0),
              occupied: Number(row.occupied ?? 0),
              isOpen: Boolean(row.isOpen),
              rules: Array.isArray(row.rules)
                ? (row.rules as Record<string, unknown>[]).map((rule) => ({
                    congregationId: rule.congregationId ? String(rule.congregationId) : null,
                    weekday: rule.weekday == null ? null : Number(rule.weekday),
                    startTime: rule.startTime ? String(rule.startTime).slice(0, 5) : null,
                    endTime: rule.endTime ? String(rule.endTime).slice(0, 5) : null,
                    minAgeMonths: Number(rule.minAgeMonths ?? 0),
                    maxAgeMonths: Number(rule.maxAgeMonths ?? 216),
                    priority: Number(rule.priority ?? 100),
                    isActive: Boolean(rule.isActive),
                  }))
                : [],
            })) as SuggestCandidate[],
          })
          if (!suggestion) throw new Error("Nenhuma sala com vagas disponível nesta sessão")
          sessionClassroomId = suggestion.sessionClassroomId
        }

        const classrooms = await tx<{ id: string; is_open: boolean; capacity_override: number | null; name: string; capacity: number }[]>`
          select sc.id, sc.is_open, sc.capacity_override, classroom.name, classroom.capacity
          from public.kid_session_classrooms sc
          join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
          where sc.id = ${sessionClassroomId} and sc.session_id = ${session.id} and sc.company_id = ${companyId}
          limit 1
        `
        const classroom = classrooms[0]
        if (!classroom) throw new Error("Sala não pertence a esta sessão")
        if (!classroom.is_open) throw new Error("Sala está fechada nesta sessão")

        const occupiedRows = await tx<{ count: number }[]>`
          select count(*)::int as count from public.kid_attendances
          where session_classroom_id = ${classroom.id} and status in ('checked_in', 'checkout_requested')
        `
        const occupied = Number(occupiedRows[0]?.count ?? 0)
        const effectiveCapacity = classroom.capacity_override ?? classroom.capacity
        let capacityOverride = false
        if (occupied >= effectiveCapacity) {
          if (!settings.allowCapacityOverride || !hasPermission(user.role, "kids.sessions.manage")) {
            throw new Error(`Sala ${classroom.name} está lotada (${occupied}/${effectiveCapacity})`)
          }
          if (parsed.overrideReason.trim().length < 5) {
            throw new Error("Sala lotada: informe o motivo da exceção de capacidade")
          }
          capacityOverride = true
        }

        const authorizedGuardians = await tx<{ id: string }[]>`
          select id from public.kid_guardians
          where kid_id = ${kid.id}
            and company_id = ${companyId}
            and can_checkout = true
            and deleted_at is null
          order by is_primary desc, created_at, id
          limit 1
        `
        const pickupGuardianId = authorizedGuardians[0]?.id
        if (!pickupGuardianId) throw new Error("Cadastre um responsável autorizado para retirada antes do check-in")

        // Transação atômica: presença + credencial de retirada.
        // O índice único parcial bloqueia duplicidade mesmo sob corrida.
        const attendances = await tx<{ id: string }[]>`
          insert into public.kid_attendances (
            company_id, session_id, session_classroom_id, classroom_name, kid_id,
            status, checked_in_by, room_override_reason
          )
          values (
            ${companyId}, ${session.id}, ${classroom.id}, ${classroom.name}, ${kid.id},
            'checked_in', ${user.id}, ${capacityOverride ? parsed.overrideReason.trim() : null}
          )
          returning id
        `
        const attendanceId = attendances[0]?.id
        if (!attendanceId) throw new Error("Check-in não foi registrado")

        const pickupToken = generatePickupToken()
        const pickupPin = generatePickupPin()
        const pinExpiresAt = new Date(Date.now() + settings.pinRotationMinutes * 60_000)
        await tx`
          insert into public.kid_pickup_credentials (
            company_id, attendance_id, kid_id, guardian_id, token_hash, pin_hash, pin_expires_at
          )
          values (
            ${companyId}, ${attendanceId}, ${kid.id}, ${pickupGuardianId},
            ${hashPickupToken(pickupToken)}, ${hashPickupPin(attendanceId, pickupPin)}, ${pinExpiresAt}
          )
        `

        await insertAccessEvent(tx, {
          companyId,
          sessionId: session.id,
          kidId: kid.id,
          attendanceId,
          eventType: "checkin",
          actorProfileId: user.id,
          metadata: {
            classroomName: classroom.name,
            capacityOverride,
          },
        })

        return {
          attendanceId,
          kidId: kid.id,
          childFullName: kid.full_name,
          classroomName: classroom.name,
          sessionTitle: session.title,
          pickupToken,
          pickupPin,
          capacityOverride,
        }
      })
    } catch (error) {
      if (isUniqueViolation(error, "kid_attendances_active_unique_idx")) {
        throw new Error("Criança já está com check-in ativo nesta sessão")
      }
      throw error
    }

    const healthRows = await sql<{
      has_allergy: boolean
      has_dietary_restriction: boolean
      has_medication: boolean
      has_special_needs: boolean
    }[]>`
      select has_allergy, has_dietary_restriction, has_medication, has_special_needs
      from public.kid_health_profiles
      where kid_id = ${outcome.kidId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    const health = healthRows[0] ?? {
      has_allergy: false,
      has_dietary_restriction: false,
      has_medication: false,
      has_special_needs: false,
    }

    const checkedInAt = new Date().toISOString()
    const label = buildKidLabelModel({
      childFullName: outcome.childFullName,
      classroomName: outcome.classroomName,
      sessionTitle: outcome.sessionTitle,
      pickupPin: outcome.pickupPin,
      pickupToken: outcome.pickupToken,
      health: {
        hasAllergy: health.has_allergy,
        hasDietaryRestriction: health.has_dietary_restriction,
        hasMedication: health.has_medication,
        hasSpecialNeeds: health.has_special_needs,
      },
      checkedInAt,
    })

    await emitKidsEvent(
      companyId,
      "kids.checkin.created",
      `kids.checkin.created:${outcome.attendanceId}`,
      buildCheckinCreatedPayload({
        attendanceId: outcome.attendanceId,
        sessionId: parsed.sessionId,
        kidId: outcome.kidId,
        childFullName: outcome.childFullName,
        classroomName: outcome.classroomName,
        checkedInAt,
      }),
    )
    if (outcome.capacityOverride) {
      await audit("kids.checkin.override", "kid_attendances", outcome.attendanceId, companyId, {
        reason: parsed.overrideReason.trim(),
        classroomName: outcome.classroomName,
      })
    }
    await audit("kids.checkin.create", "kid_attendances", outcome.attendanceId, companyId, {
      classroomName: outcome.classroomName,
    })
    await enqueueOperationalSafe({
      companyId,
      kind: "checkin",
      kidId: outcome.kidId,
      sessionId: parsed.sessionId,
      attendanceId: outcome.attendanceId,
      vars: {
        childName: label.childName,
        classroomName: outcome.classroomName,
        sessionTitle: outcome.sessionTitle,
        time: timeNowPtBr(),
      },
      createdBy: user.id,
    })
    refresh()
    return { ok: true, attendanceId: outcome.attendanceId, label }
  } catch (error) {
    const mapped = failure(error)
    return { ok: false, error: mapped.error }
  }
}

export async function requestKidCheckout(input: z.input<typeof kidCheckoutRequestSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidCheckoutRequestSchema.parse(input)
    const { user, companyId } = await context("kids.checkout.create")
    const sql = getSql()

    const rows = await sql<{ id: string; session_id: string; kid_id: string }[]>`
      update public.kid_attendances
      set status = 'checkout_requested', checkout_requested_at = now(), checkout_requested_by = ${user.id}
      where id = ${parsed.attendanceId}
        and company_id = ${companyId}
        and status = 'checked_in'
      returning id, session_id, kid_id
    `
    const row = rows[0]
    if (!row) throw new Error("Presença não encontrada ou já encerrada")

    const requestedAt = new Date().toISOString()
    await emitKidsEvent(
      companyId,
      "kids.checkout.requested",
      `kids.checkout.requested:${row.id}:${Date.now()}`,
      buildCheckoutRequestedPayload({
        attendanceId: row.id,
        sessionId: row.session_id,
        kidId: row.kid_id,
        requestedBy: "staff",
        requestedAt,
      }),
    )
    refresh()
    return { ok: true, id: row.id }
  } catch (error) {
    return failure(error)
  }
}

export async function checkoutKid(input: z.input<typeof kidCheckoutSchema>): Promise<KidsCheckoutResult> {
  try {
    const parsed = kidCheckoutSchema.parse(input)
    const { user, companyId } = await context("kids.checkout.create")

    const isOverride = parsed.overrideReason.trim().length > 0
    if (isOverride) {
      if (parsed.overrideReason.trim().length < 5) {
        throw new Error("Motivo da exceção deve ter ao menos 5 caracteres")
      }
      await requirePermission("kids.checkout.override", companyId)
      await requireRecentAuthentication()
    }

    const token = parsed.qrPayload ? parseQrPayload(parsed.qrPayload) : null
    if (parsed.qrPayload && !token) {
      return { ok: false, error: "QR inválido", deniedReason: "invalid_token" }
    }

    const sql = getSql()
    type CheckoutDenied = "invalid_token" | "session_closed" | "already_out" | "locked" | "pin_expired" | "pin_invalid"
    type CheckoutOutcome =
      | { ok: true; attendanceId: string; kidId: string; childFullName: string; classroomName: string }
      | { ok: false; denied: CheckoutDenied }
    const outcome = await sql.begin(async (tx): Promise<CheckoutOutcome> => {
      const sessions = await tx<{ id: string; status: string; congregation_id: string | null }[]>`
        select id, status, congregation_id from public.kid_sessions
        where id = ${parsed.sessionId} and company_id = ${companyId} and deleted_at is null
        for update
      `
      const session = sessions[0]
      if (!session) throw new Error("Sessão não encontrada")
      if (session.status !== "open") {
        await insertAccessEvent(tx, {
          companyId, sessionId: session.id, eventType: "checkout_denied",
          actorProfileId: user.id, metadata: { reason: "session_closed" },
        })
        return { ok: false, denied: "session_closed" }
      }

      const settingsRows = await tx<{ congregation_id: string | null; require_checkout_pin: boolean; pin_rotation_minutes: number; allow_capacity_override: boolean; label_paper: string; label_show_qr: boolean; auto_print: boolean; visitor_form_enabled: boolean; required_consent_types: string[] | null }[]>`
        select * from public.kid_settings where company_id = ${companyId}
      `
      const settings = resolveSettingsFromRows(settingsRows, session.congregation_id)

      type CheckoutRow = {
        attendance_id: string
        attendance_status: string
        kid_id: string
        classroom_name: string
        credential_id: string | null
        guardian_id: string | null
        guardian_authorized: boolean
        pin_hash: string | null
        pin_expires_at: Date | string | null
        failed_attempts: number | null
        locked_at: Date | string | null
        full_name: string
      }
      let rows: CheckoutRow[]
      if (token) {
        rows = await tx<CheckoutRow[]>`
          select a.id as attendance_id, a.status as attendance_status, a.kid_id, a.classroom_name,
                 credential.id as credential_id, credential.guardian_id, credential.pin_hash, credential.pin_expires_at,
                 credential.failed_attempts, credential.locked_at,
                 exists (
                   select 1 from public.kid_guardians guardian
                   where guardian.id = credential.guardian_id
                     and guardian.kid_id = a.kid_id
                     and guardian.can_checkout = true
                     and guardian.deleted_at is null
                 ) as guardian_authorized,
                 p.full_name
          from public.kid_pickup_credentials credential
          join public.kid_attendances a on a.id = credential.attendance_id
          join public.kid_profiles kid on kid.id = a.kid_id
          join public.people p on p.id = kid.person_id
          where credential.company_id = ${companyId}
            and credential.token_hash = ${hashPickupToken(token)}
            and credential.status = 'active'
            and a.session_id = ${session.id}
          limit 1
        `
      } else if (parsed.attendanceId) {
        rows = await tx<CheckoutRow[]>`
          select a.id as attendance_id, a.status as attendance_status, a.kid_id, a.classroom_name,
                 credential.id as credential_id, credential.guardian_id, credential.pin_hash, credential.pin_expires_at,
                 credential.failed_attempts, credential.locked_at,
                 exists (
                   select 1 from public.kid_guardians guardian
                   where guardian.id = credential.guardian_id
                     and guardian.kid_id = a.kid_id
                     and guardian.can_checkout = true
                     and guardian.deleted_at is null
                 ) as guardian_authorized,
                 p.full_name
          from public.kid_attendances a
          join public.kid_profiles kid on kid.id = a.kid_id
          join public.people p on p.id = kid.person_id
          left join public.kid_pickup_credentials credential
            on credential.attendance_id = a.id and credential.status = 'active'
          where a.id = ${parsed.attendanceId}
            and a.company_id = ${companyId}
            and a.session_id = ${session.id}
          limit 1
        `
      } else {
        throw new Error("Leia o QR da etiqueta ou selecione a criança")
      }

      const row = rows[0]
      if (!row) {
        await insertAccessEvent(tx, {
          companyId, sessionId: session.id, eventType: "checkout_denied",
          actorProfileId: user.id, metadata: { reason: "invalid_token" },
        })
        return { ok: false, denied: "invalid_token" }
      }

      // Lock da presença: segunda tentativa concorrente não retira novamente.
      await tx`select id from public.kid_attendances where id = ${row.attendance_id} for update`
      const recheck = await tx<{ status: string }[]>`
        select status from public.kid_attendances where id = ${row.attendance_id}
      `
      if (!["checked_in", "checkout_requested"].includes(recheck[0]?.status ?? "")) {
        await insertAccessEvent(tx, {
          companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
          eventType: "checkout_denied", actorProfileId: user.id, metadata: { reason: "already_out" },
        })
        return { ok: false, denied: "already_out" }
      }

      if (!isOverride) {
        if (!row.credential_id || !row.pin_hash || !row.guardian_id || !row.guardian_authorized) {
          await insertAccessEvent(tx, {
            companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
            eventType: "checkout_denied", actorProfileId: user.id, metadata: { reason: "invalid_token" },
          })
          return { ok: false, denied: "invalid_token" }
        }
        const failedAttempts = Number(row.failed_attempts ?? 0)
        if (row.locked_at && failedAttempts >= 5) {
          await insertAccessEvent(tx, {
            companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
            eventType: "checkout_denied", actorProfileId: user.id, metadata: { reason: "locked" },
          })
          return { ok: false, denied: "locked" }
        }
        if (row.pin_expires_at && new Date(row.pin_expires_at) < new Date()) {
          await insertAccessEvent(tx, {
            companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
            eventType: "checkout_denied", actorProfileId: user.id, metadata: { reason: "pin_expired" },
          })
          return { ok: false, denied: "pin_expired" }
        }
        if (settings.requireCheckoutPin) {
          if (!parsed.pin || !verifyPickupPin(row.attendance_id, parsed.pin, row.pin_hash)) {
            const attempts = failedAttempts + 1
            const lock = attempts >= 5
            await tx`
              update public.kid_pickup_credentials
              set failed_attempts = ${attempts}, locked_at = ${lock ? new Date() : null}
              where id = ${row.credential_id}
            `
            await insertAccessEvent(tx, {
              companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
              eventType: "checkout_denied", actorProfileId: user.id,
              metadata: { reason: "pin_invalid", attempts },
            })
            if (lock) {
              await insertAccessEvent(tx, {
                companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
                eventType: "credential_locked", actorProfileId: user.id, metadata: { attempts },
              })
            }
            return { ok: false, denied: "pin_invalid" }
          }
        }
      }

      const now = new Date()
      await tx`
        update public.kid_attendances
        set status = 'checked_out', checked_out_at = ${now}, checked_out_by = ${user.id}
        where id = ${row.attendance_id}
      `
      // Credencial expira e é revogada imediatamente após o checkout.
      if (row.credential_id) {
        await tx`
          update public.kid_pickup_credentials
          set status = 'used', used_at = ${now}
          where id = ${row.credential_id}
        `
      }
      await tx`
        update public.kid_pickup_credentials
        set status = 'revoked', revoked_at = ${now}
        where attendance_id = ${row.attendance_id} and status = 'active'
      `

      await insertAccessEvent(tx, {
        companyId, sessionId: session.id, kidId: row.kid_id, attendanceId: row.attendance_id,
        eventType: isOverride ? "checkout_override" : "checkout",
        actorProfileId: user.id,
        metadata: isOverride ? { reason: parsed.overrideReason.trim() } : {},
      })

      return {
        ok: true as const,
        attendanceId: row.attendance_id,
        kidId: row.kid_id,
        childFullName: row.full_name,
        classroomName: row.classroom_name,
      }
    })

    if (!outcome.ok) {
      const messages: Record<CheckoutDenied, string> = {
        invalid_token: "QR inválido, expirado ou já utilizado",
        session_closed: "Sessão não está aberta",
        already_out: "Esta criança já foi retirada",
        locked: "Credencial bloqueada por tentativas. Use a exceção auditada.",
        pin_expired: "PIN expirado. Gere um novo na recepção.",
        pin_invalid: "PIN incorreto",
      }
      return { ok: false, error: messages[outcome.denied], deniedReason: outcome.denied }
    }

    const checkedOutAt = new Date().toISOString()
    await emitKidsEvent(
      companyId,
      "kids.checkout.completed",
      `kids.checkout.completed:${outcome.attendanceId}`,
      buildCheckoutCompletedPayload({
        attendanceId: outcome.attendanceId,
        sessionId: parsed.sessionId,
        kidId: outcome.kidId,
        childFullName: outcome.childFullName,
        checkedOutAt,
        override: isOverride,
      }),
    )
    await audit(
      isOverride ? "kids.checkout.override" : "kids.checkout.create",
      "kid_attendances",
      outcome.attendanceId,
      companyId,
      isOverride ? { reason: parsed.overrideReason.trim() } : {},
    )
    await enqueueOperationalSafe({
      companyId,
      kind: "checkout",
      kidId: outcome.kidId,
      sessionId: parsed.sessionId,
      attendanceId: outcome.attendanceId,
      vars: {
        childName: formatChildLabelName(outcome.childFullName),
        classroomName: outcome.classroomName,
        time: timeNowPtBr(),
      },
      createdBy: user.id,
    })
    refresh()
    return { ok: true, childName: formatChildLabelName(outcome.childFullName), classroomName: outcome.classroomName }
  } catch (error) {
    const mapped = failure(error)
    return { ok: false, error: mapped.error }
  }
}

/** Gera novo token+PIN (etiqueta perdida/PIN expirado) e retorna o modelo para reimpressão. */
export async function rotateKidCredential(input: z.input<typeof kidRotateCredentialSchema>): Promise<KidsCheckinResult> {
  try {
    const parsed = kidRotateCredentialSchema.parse(input)
    const { user, companyId } = await context("kids.checkin.create")
    const sql = getSql()

    const outcome = await sql.begin(async (tx) => {
      const attendances = await tx<{
        id: string
        kid_id: string
        session_id: string
        classroom_name: string
        status: string
        session_title: string
        session_status: string
        congregation_id: string | null
        full_name: string
      }[]>`
        select a.id, a.kid_id, a.session_id, a.classroom_name, a.status,
               session.title as session_title, session.status as session_status, session.congregation_id,
               p.full_name
        from public.kid_attendances a
        join public.kid_sessions session on session.id = a.session_id and session.deleted_at is null
        join public.kid_profiles kid on kid.id = a.kid_id
        join public.people p on p.id = kid.person_id
        where a.id = ${parsed.attendanceId} and a.company_id = ${companyId}
        for update of a
      `
      const attendance = attendances[0]
      if (!attendance) throw new Error("Presença não encontrada")
      if (attendance.session_status !== "open") throw new Error("Sessão não está aberta")
      if (!["checked_in", "checkout_requested"].includes(attendance.status)) throw new Error("Criança já foi retirada")

      const settingsRows = await tx<{ congregation_id: string | null; require_checkout_pin: boolean; pin_rotation_minutes: number; allow_capacity_override: boolean; label_paper: string; label_show_qr: boolean; auto_print: boolean; visitor_form_enabled: boolean; required_consent_types: string[] | null }[]>`
        select * from public.kid_settings where company_id = ${companyId}
      `
      const settings = resolveSettingsFromRows(settingsRows, attendance.congregation_id)

      const pickupToken = generatePickupToken()
      const pickupPin = generatePickupPin()
      const pinExpiresAt = new Date(Date.now() + settings.pinRotationMinutes * 60_000)

      const authorizedGuardians = await tx<{ id: string }[]>`
        select id from public.kid_guardians
        where kid_id = ${attendance.kid_id}
          and company_id = ${companyId}
          and can_checkout = true
          and deleted_at is null
        order by is_primary desc, created_at, id
        limit 1
      `
      const pickupGuardianId = authorizedGuardians[0]?.id
      if (!pickupGuardianId) throw new Error("Nenhum responsável autorizado para retirada")

      // Rotação substitui os hashes: valores antigos deixam de existir imediatamente.
      await tx`
        update public.kid_pickup_credentials
        set status = 'revoked', revoked_at = now()
        where attendance_id = ${attendance.id} and status = 'active'
      `
      await tx`
        insert into public.kid_pickup_credentials (
          company_id, attendance_id, kid_id, guardian_id, token_hash, pin_hash, pin_expires_at, rotation_count
        )
        values (
          ${companyId}, ${attendance.id}, ${attendance.kid_id}, ${pickupGuardianId},
          ${hashPickupToken(pickupToken)}, ${hashPickupPin(attendance.id, pickupPin)}, ${pinExpiresAt}, 1
        )
      `

      await insertAccessEvent(tx, {
        companyId, sessionId: attendance.session_id, kidId: attendance.kid_id, attendanceId: attendance.id,
        eventType: "credential_rotated", actorProfileId: user.id, metadata: {},
      })

      return {
        attendanceId: attendance.id,
        kidId: attendance.kid_id,
        childFullName: attendance.full_name,
        classroomName: attendance.classroom_name,
        sessionTitle: attendance.session_title,
        pickupToken,
        pickupPin,
      }
    })

    const healthRows = await sql<{
      has_allergy: boolean
      has_dietary_restriction: boolean
      has_medication: boolean
      has_special_needs: boolean
    }[]>`
      select has_allergy, has_dietary_restriction, has_medication, has_special_needs
      from public.kid_health_profiles
      where kid_id = ${outcome.kidId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `
    const health = healthRows[0] ?? { has_allergy: false, has_dietary_restriction: false, has_medication: false, has_special_needs: false }

    const label = buildKidLabelModel({
      childFullName: outcome.childFullName,
      classroomName: outcome.classroomName,
      sessionTitle: outcome.sessionTitle,
      pickupPin: outcome.pickupPin,
      pickupToken: outcome.pickupToken,
      health: {
        hasAllergy: health.has_allergy,
        hasDietaryRestriction: health.has_dietary_restriction,
        hasMedication: health.has_medication,
        hasSpecialNeeds: health.has_special_needs,
      },
      checkedInAt: new Date().toISOString(),
    })

    refresh()
    return { ok: true, attendanceId: outcome.attendanceId, label }
  } catch (error) {
    const mapped = failure(error)
    return { ok: false, error: mapped.error }
  }
}

// ---------------------------------------------------------------------------
// Fase 2 — durante a sessão: chamado, troca de sala e incidentes
// ---------------------------------------------------------------------------

export async function callKidGuardian(input: z.input<typeof kidGuardianCallSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidGuardianCallSchema.parse(input)
    const { user, companyId } = await contextAny(["kids.room.view", "kids.checkin.create"])
    await assertVolunteerAttendanceAccess(user, companyId, parsed.attendanceId)
    const sql = getSql()

    const rows = await sql<{ id: string; session_id: string; kid_id: string; classroom_name: string; full_name: string }[]>`
      select a.id, a.session_id, a.kid_id, a.classroom_name, p.full_name
      from public.kid_attendances a
      join public.kid_profiles kid on kid.id = a.kid_id
      join public.people p on p.id = kid.person_id
      where a.id = ${parsed.attendanceId}
        and a.company_id = ${companyId}
        and a.status in ('checked_in', 'checkout_requested')
      limit 1
    `
    const row = rows[0]
    if (!row) throw new Error("Presença não encontrada ou já encerrada")

    await sql`
      insert into public.kid_access_events (company_id, session_id, kid_id, attendance_id, event_type, actor_profile_id, metadata)
      values (
        ${companyId}, ${row.session_id}, ${row.kid_id}, ${row.id},
        'guardian_called', ${user.id}, ${jsonbParam(sql, { reason: parsed.reason })}
      )
    `

    const calledAt = new Date().toISOString()
    await emitKidsEvent(
      companyId,
      "kids.guardian.called",
      `kids.guardian.called:${row.id}:${Date.now()}`,
      buildGuardianCalledPayload({
        attendanceId: row.id,
        sessionId: row.session_id,
        kidId: row.kid_id,
        childFullName: row.full_name,
        classroomName: row.classroom_name,
        reason: parsed.reason,
        calledAt,
      }),
    )
    await enqueueOperationalSafe({
      companyId,
      kind: "guardian_call",
      kidId: row.kid_id,
      sessionId: row.session_id,
      attendanceId: row.id,
      vars: {
        childName: formatChildLabelName(row.full_name),
        classroomName: row.classroom_name,
        reason: parsed.reason,
        time: timeNowPtBr(),
      },
      createdBy: user.id,
    })
    refresh()
    return { ok: true, id: row.id }
  } catch (error) {
    return failure(error)
  }
}

/** Troca de sala durante a sessão — permissão de recepção e justificativa auditada. */
export async function moveKidRoom(input: unknown): Promise<KidsActionResult> {
  try {
    const parsed = z
      .object({
        attendanceId: z.string().uuid(),
        sessionClassroomId: z.string().uuid(),
        reason: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres)").max(300),
      })
      .parse(input)
    const { user, companyId } = await context("kids.checkin.create")
    const sql = getSql()

    await sql.begin(async (tx) => {
      const attendances = await tx<{ id: string; session_id: string; kid_id: string; classroom_name: string }[]>`
        select a.id, a.session_id, a.kid_id, a.classroom_name
        from public.kid_attendances a
        where a.id = ${parsed.attendanceId} and a.company_id = ${companyId}
          and a.status in ('checked_in', 'checkout_requested')
        for update
      `
      const attendance = attendances[0]
      if (!attendance) throw new Error("Presença não encontrada ou já encerrada")

      const classrooms = await tx<{ id: string; is_open: boolean; capacity_override: number | null; capacity: number; name: string }[]>`
        select sc.id, sc.is_open, sc.capacity_override, classroom.capacity, classroom.name
        from public.kid_session_classrooms sc
        join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
        where sc.id = ${parsed.sessionClassroomId} and sc.session_id = ${attendance.session_id} and sc.company_id = ${companyId}
        limit 1
      `
      const classroom = classrooms[0]
      if (!classroom) throw new Error("Sala não pertence a esta sessão")
      if (!classroom.is_open) throw new Error("Sala está fechada nesta sessão")

      const occupiedRows = await tx<{ count: number }[]>`
        select count(*)::int as count from public.kid_attendances
        where session_classroom_id = ${classroom.id} and status in ('checked_in', 'checkout_requested')
      `
      const effectiveCapacity = classroom.capacity_override ?? classroom.capacity
      if (Number(occupiedRows[0]?.count ?? 0) >= effectiveCapacity && !hasPermission(user.role, "kids.sessions.manage")) {
        throw new Error(`Sala ${classroom.name} está lotada`)
      }

      await tx`
        update public.kid_attendances
        set session_classroom_id = ${classroom.id}, classroom_name = ${classroom.name}, room_override_reason = ${parsed.reason}
        where id = ${attendance.id}
      `
      await insertAccessEvent(tx, {
        companyId, sessionId: attendance.session_id, kidId: attendance.kid_id, attendanceId: attendance.id,
        eventType: "room_changed", actorProfileId: user.id,
        metadata: { from: attendance.classroom_name, to: classroom.name, reason: parsed.reason },
      })

      await audit("kids.room.change", "kid_attendances", attendance.id, companyId, {
        from: attendance.classroom_name,
        to: classroom.name,
        reason: parsed.reason,
      })
    })

    refresh()
    return { ok: true, id: parsed.attendanceId }
  } catch (error) {
    return failure(error)
  }
}

export async function saveKidIncident(input: z.input<typeof kidIncidentSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidIncidentSchema.parse(input)
    const { user, companyId } = await contextAny(["kids.room.view", "kids.checkin.create"])
    if (user.role === "volunteer" && !parsed.sessionClassroomId) {
      throw new Error("Voluntário deve informar a sala do incidente")
    }
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      insert into public.kid_incidents (
        company_id, session_id, session_classroom_id, kid_id, severity, title, description,
        reported_by, created_by, updated_by
      )
      values (
        ${companyId}, ${parsed.sessionId}, ${parsed.sessionClassroomId}, ${parsed.kidId},
        ${parsed.severity}, ${parsed.title}, ${parsed.description}, ${user.id}, ${user.id}, ${user.id}
      )
      returning id
    `
    const id = rows[0]?.id
    if (!id) throw new Error("Incidente não foi registrado")

    await emitKidsEvent(
      companyId,
      "kids.incident.created",
      `kids.incident.created:${id}`,
      buildIncidentCreatedPayload({
        incidentId: id,
        sessionId: parsed.sessionId,
        kidId: parsed.kidId,
        severity: parsed.severity,
        title: parsed.title,
        createdAt: new Date().toISOString(),
      }),
    )
    await audit("kids.incident.save", "kid_incidents", id, companyId, { severity: parsed.severity })
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function resolveKidIncident(input: unknown): Promise<KidsActionResult> {
  try {
    const id = z.string().uuid().parse(input)
    const { user, companyId } = await context("kids.sessions.manage")
    const sql = getSql()

    const rows = await sql<{ id: string }[]>`
      update public.kid_incidents
      set resolved_at = now(), resolved_by = ${user.id}, updated_by = ${user.id}
      where id = ${id} and company_id = ${companyId} and deleted_at is null and resolved_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Incidente não encontrado ou já resolvido")

    await audit("kids.incident.resolve", "kid_incidents", id, companyId)
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

// ---------------------------------------------------------------------------
// Fase 4 — relatório de aula e campanhas
// ---------------------------------------------------------------------------

export async function saveKidLessonReport(input: z.input<typeof kidLessonReportSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidLessonReportSchema.parse(input)
    const { user, companyId } = await contextAny(["kids.room.view", "kids.checkin.create"])
    const sql = getSql()

    // Voluntário só registra relatório da sala atribuída.
    if (user.role === "volunteer") {
      if (!parsed.sessionClassroomId) throw new Error("Voluntário deve informar a sala")
      const assignment = await sql<{ id: string }[]>`
        select id from public.kid_staff_assignments
        where session_id = ${parsed.sessionId}
          and profile_id = ${user.id}
          and session_classroom_id = ${parsed.sessionClassroomId}
        limit 1
      `
      if (!assignment[0]?.id) throw new Error("Acesso negado")
    }

    let classroomName = ""
    if (parsed.sessionClassroomId) {
      const classroomRows = await sql<{ name: string }[]>`
        select classroom.name
        from public.kid_session_classrooms sc
        join public.kid_classrooms classroom on classroom.id = sc.classroom_id and classroom.deleted_at is null
        where sc.id = ${parsed.sessionClassroomId} and sc.company_id = ${companyId}
        limit 1
      `
      if (!classroomRows[0]?.name) throw new Error("Sala não encontrada nesta sessão")
      classroomName = classroomRows[0].name
    }

    const rows = await sql<{ id: string }[]>`
      insert into public.kid_lesson_reports (
        company_id, session_id, session_classroom_id, kid_id, title, content,
        shared_with_guardians, author_profile_id, created_by, updated_by
      )
      values (
        ${companyId}, ${parsed.sessionId}, ${parsed.sessionClassroomId}, ${parsed.kidId},
        ${parsed.title}, ${parsed.content}, ${parsed.sharedWithGuardians}, ${user.id}, ${user.id}, ${user.id}
      )
      returning id
    `
    const id = rows[0]?.id
    if (!id) throw new Error("Relatório não foi salvo")

    if (parsed.sharedWithGuardians) {
      try {
        const { enqueueLessonReportNotification, processKidDeliveryOutbox } = await import("@/lib/kids/delivery")
        await enqueueLessonReportNotification({
          companyId,
          reportId: id,
          sessionId: parsed.sessionId,
          sessionClassroomId: parsed.sessionClassroomId,
          kidId: parsed.kidId,
          classroomName: classroomName || "sala Kids",
          reportTitle: parsed.title,
          createdBy: user.id,
        })
        try {
          await processKidDeliveryOutbox(25)
        } catch {
          /* worker/cron continua o despacho */
        }
      } catch {
        /* mensageria é best-effort por contrato */
      }
    }

    await audit("kids.lesson_report.save", "kid_lesson_reports", id, companyId, {
      sharedWithGuardians: parsed.sharedWithGuardians,
      kidId: parsed.kidId,
    })
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function sendKidCampaign(input: z.input<typeof kidCampaignSchema>): Promise<KidsActionResult> {
  try {
    const parsed = kidCampaignSchema.parse(input)
    const { user, companyId } = await context("kids.communicate")
    const { enqueueCampaignMessage, processKidDeliveryOutbox } = await import("@/lib/kids/delivery")

    const result = await enqueueCampaignMessage({
      companyId,
      channel: parsed.channel,
      subject: parsed.channel === "email" ? parsed.subject : parsed.subject || "Kids",
      body: parsed.body,
      segment: {
        congregationId: parsed.congregationId,
        classroomId: parsed.classroomId,
        minAgeMonths: parsed.minAgeMonths,
        maxAgeMonths: parsed.maxAgeMonths,
        kidId: parsed.kidId,
      },
      createdBy: user.id,
    })

    await audit("kids.communicate.send", "kid_messages", result.messageId, companyId, {
      channel: parsed.channel,
      enqueued: result.enqueued,
    })
    try {
      await processKidDeliveryOutbox(25)
    } catch {
      /* worker/cron continua o despacho */
    }
    refresh()
    return { ok: true, id: result.messageId }
  } catch (error) {
    return failure(error)
  }
}

/** Mapeia linhas de kid_settings para a configuração efetiva (override de congregação vence). */
function resolveSettingsFromRows(
  rows: {
    congregation_id: string | null
    require_checkout_pin: boolean
    pin_rotation_minutes: number
    allow_capacity_override: boolean
    label_paper: string
    label_show_qr: boolean
    auto_print: boolean
    visitor_form_enabled: boolean
    required_consent_types: string[] | null
  }[],
  congregationId: string | null,
): KidEffectiveSettings {
  const defaults: KidEffectiveSettings = {
    requireCheckoutPin: true,
    pinRotationMinutes: 30,
    allowCapacityOverride: true,
    labelPaper: "thermal_62x40",
    labelShowQr: true,
    autoPrint: true,
    visitorFormEnabled: true,
    requiredConsentTypes: ["data_processing", "emergency_care"],
  }
  const companyDefault = rows.find((row) => row.congregation_id === null) ?? null
  const override = congregationId ? (rows.find((row) => row.congregation_id === congregationId) ?? null) : null
  const row = override ?? companyDefault
  if (!row) return defaults
  return {
    requireCheckoutPin: row.require_checkout_pin,
    pinRotationMinutes: row.pin_rotation_minutes,
    allowCapacityOverride: row.allow_capacity_override,
    labelPaper: row.label_paper as KidEffectiveSettings["labelPaper"],
    labelShowQr: row.label_show_qr,
    autoPrint: row.auto_print,
    visitorFormEnabled: row.visitor_form_enabled,
    requiredConsentTypes: (row.required_consent_types ?? defaults.requiredConsentTypes) as KidEffectiveSettings["requiredConsentTypes"],
  }
}
