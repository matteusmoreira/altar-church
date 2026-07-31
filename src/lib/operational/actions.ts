"use server"

import { revalidatePath } from "next/cache"
import { afterResponse } from "@/lib/performance/after-response"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { createNotificationCampaignDeliveries } from "@/lib/notifications/campaign"
import type { Permission } from "@/lib/types"

type ActionResult = {
  ok: boolean
  id?: string
  error?: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const requiredString = (label: string) => z.string().trim().min(1, `${label} obrigatório`)
const optionalUuidField = z
  .string()
  .trim()
  .refine((value) => value === "" || uuidPattern.test(value), "ID inválido")
  .optional()
const requiredUuidField = z.string().trim().refine((value) => uuidPattern.test(value), "ID inválido")
const positiveMoneyField = z.preprocess(
  (value) => (typeof value === "string" ? Number(value.replace(/\./g, "").replace(",", ".")) : value),
  z.number().positive("Valor obrigatório")
)

const eventSchema = z.object({
  id: optionalUuidField,
  title: requiredString("Título"),
  startDate: requiredString("Início"),
  type: z.enum(["service", "prayer", "youth", "children", "special", "meeting"]).default("service"),
  status: z.enum(["draft", "published", "cancelled"]).default("draft"),
})
const attendanceSchema = z.object({
  personId: optionalUuidField,
  personName: z.string().trim().optional().default(""),
  date: requiredString("Data"),
})
const prayerSchema = z.object({
  id: optionalUuidField,
  name: requiredString("Nome"),
  message: requiredString("Mensagem"),
})
const readingPlanSchema = z.object({
  id: optionalUuidField,
  name: requiredString("Nome"),
})
const readingPlanStepSchema = z.object({
  id: optionalUuidField,
  planId: requiredUuidField,
  dayNumber: z.preprocess((value) => Number(value), z.number().int().positive("Dia inválido")),
  title: requiredString("Título"),
})
const announcementSchema = z.object({
  id: optionalUuidField,
  title: requiredString("Título"),
  content: requiredString("Conteúdo"),
})
const notificationSchema = z.object({
  title: requiredString("Título"),
  content: requiredString("Conteúdo"),
  method: z.enum(["push", "email", "whatsapp"]),
  audience: z.enum(["all", "cell", "ministry", "visitors", "birthdays", "manual"]),
  audienceRefId: z.string().trim().optional().default(""),
  audiencePersonIds: z.string().trim().optional().default(""),
  scheduledAt: z.string().trim().optional().default(""),
})
const notificationGroupSchema = z.object({
  name: requiredString("Nome"),
})
const crmCardSchema = z.object({
  id: optionalUuidField,
  personId: optionalUuidField,
  personName: z.string().trim().optional().default(""),
  stageId: optionalUuidField,
})
const crmStageSchema = z.object({
  id: optionalUuidField,
  name: requiredString("Nome"),
  color: z.string().trim().optional().default("#6366f1"),
  sortOrder: z.string().trim().optional().default("0"),
  isDefault: z.string().trim().optional().default(""),
})
const deleteCrmStageSchema = z.object({
  id: requiredUuidField,
  reassignStageId: optionalUuidField,
})
const revenueSchema = z.object({
  amount: positiveMoneyField,
  description: requiredString("Descrição"),
  paymentDate: requiredString("Data de pagamento"),
})
const expenseSchema = z.object({
  amount: positiveMoneyField,
  description: requiredString("Descrição"),
  paymentDate: requiredString("Data de pagamento"),
})
const financialCategorySchema = z.object({
  name: requiredString("Nome"),
  type: z.enum(["revenue", "expense"]),
})
const costCenterSchema = z.object({
  title: requiredString("Título"),
})
const bankAccountSchema = z.object({
  description: requiredString("Descrição"),
})
const supplierSchema = z.object({
  name: requiredString("Nome"),
})
const donationSchema = z.object({
  amount: positiveMoneyField,
  date: requiredString("Data"),
})
const donationRecurrenceSchema = z.object({
  userName: requiredString("Usuário"),
  amount: positiveMoneyField,
})
const subscriptionPlanSchema = z.object({
  code: requiredString("Código"),
  name: requiredString("Nome"),
})
const subscriptionTagSchema = z.object({
  name: requiredString("Nome"),
})
const subscriptionSchema = z.object({
  startDate: requiredString("Data início"),
  planId: requiredUuidField.optional().or(z.literal("")),
})
const subscriptionContentSchema = z.object({
  title: requiredString("Título"),
})
const subscriptionCollectionSchema = z.object({
  title: requiredString("Título"),
})
const deleteEntitySchema = z.object({
  id: requiredUuidField,
})
const eventStatusSchema = z.object({
  id: requiredUuidField,
  status: z.enum(["published", "cancelled"]),
})

function text(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : fallback
}

function optionalText(formData: FormData, key: string) {
  const value = text(formData, key)
  return value.length > 0 ? value : null
}

function bool(formData: FormData, key: string, fallback = false) {
  const value = formData.get(key)
  if (typeof value !== "string") return fallback
  return ["1", "true", "yes", "sim", "on", "published", "active"].includes(value.toLowerCase())
}

function money(formData: FormData, key: string) {
  const normalized = text(formData, key).replace(/\./g, "").replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : 0
}

function integer(formData: FormData, key: string, fallback = 0) {
  const value = Number.parseInt(text(formData, key), 10)
  return Number.isFinite(value) ? value : fallback
}

function uuid(formData: FormData, key: string) {
  const value = text(formData, key)
  return uuidPattern.test(value) ? value : null
}

function list(formData: FormData, key: string) {
  const values = formData.getAll(key).filter((value): value is string => typeof value === "string")
  return (values.length > 0 ? values : [text(formData, key)])
    .flatMap((value) => value.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
}

function formDataToObject(formData: FormData) {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      values[key] = value.trim()
    }
  }
  return values
}

function validateActionForm(formData: FormData, schema: z.ZodType) {
  schema.parse(formDataToObject(formData))
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key)
  if (!value) {
    throw new Error(`${label} obrigatório`)
  }
  return value
}

function toErrorResult(error: unknown): ActionResult {
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

function assertHttpUrl(value: string, label: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
  } catch {
    throw new Error(`${label} deve ser uma URL HTTP ou HTTPS válida`)
  }
}

async function actionContext(formData: FormData, permission: Permission) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const inputCompanyId = optionalText(formData, "companyId")
  const companyId = requireUserCompanyId(user, inputCompanyId)
  await requirePermission(permission, companyId)
  return { user, companyId }
}

async function audit(action: string, entityTable: string, entityId: string, companyId: string, metadata: Record<string, unknown> = {}) {
  await writeAuditLog({ action, entityTable, entityId, companyId, metadata })
}

async function resolvePersonReference(
  companyId: string,
  personId: string | null,
  fallbackName: string
) {
  if (personId) {
    const rows = await getSql()<{ full_name: string; phone: string; email: string | null }[]>`
      select full_name, phone, coalesce(email, '') as email
      from public.people
      where id = ${personId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    const person = rows[0]
    if (!person) throw new Error("Pessoa não encontrada no cadastro")
    return {
      personId,
      personName: person.full_name,
      personPhone: person.phone,
      personEmail: person.email ?? "",
    }
  }

  const personName = fallbackName.trim()
  if (!personName) throw new Error("Selecione uma pessoa ou informe o nome")
  return { personId: null, personName, personPhone: "", personEmail: "" }
}

async function attachReceiptFile(formData: FormData, input: { companyId: string; userId: string; entityTable: "revenues" | "expenses" | "donations"; entityId: string }) {
  const file = getOptionalFile(formData, "receiptFile")
  if (!file) return

  const uploaded = await uploadManagedFile({
    file,
    companyId: input.companyId,
    ownerProfileId: input.userId,
    entityTable: input.entityTable,
    entityId: input.entityId,
    purpose: "receipt",
    metadata: { source: "financial_receipt" },
  })

  const sql = getSql()
  await sql`
    update public.${sql(input.entityTable)}
    set receipt_file_id = ${uploaded.id},
        updated_by = ${input.userId},
        updated_at = now()
    where id = ${input.entityId}
      and company_id = ${input.companyId}
  `

  await writeAuditLog({
    action: "financial_receipt.upload",
    entityTable: input.entityTable,
    entityId: input.entityId,
    companyId: input.companyId,
    metadata: {
      fileId: uploaded.id,
      originalName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
    },
  })
}

async function attachOperationalMediaFile(
  formData: FormData,
  input: {
    fileKey: string
    companyId: string
    userId: string
    entityTable: "reading_plans" | "subscription_contents" | "subscription_collections"
    entityId: string
    purpose: "cover" | "highlight"
    fileColumn: "cover_file_id" | "highlight_file_id"
  },
) {
  const file = getOptionalFile(formData, input.fileKey)
  if (!file) return

  const uploaded = await uploadManagedFile({
    file,
    companyId: input.companyId,
    ownerProfileId: input.userId,
    entityTable: input.entityTable,
    entityId: input.entityId,
    purpose: input.purpose,
    metadata: { source: "operational_media", fileKey: input.fileKey },
  })

  const sql = getSql()
  await sql`
    update public.${sql(input.entityTable)}
    set ${sql(input.fileColumn)} = ${uploaded.id},
        updated_by = ${input.userId},
        updated_at = now()
    where id = ${input.entityId}
      and company_id = ${input.companyId}
  `

  await writeAuditLog({
    action: "operational_media.upload",
    entityTable: input.entityTable,
    entityId: input.entityId,
    companyId: input.companyId,
    metadata: {
      fileId: uploaded.id,
      fileColumn: input.fileColumn,
      originalName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
    },
  })
}

function refresh(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path)
  }
}

export async function saveEvent(formData: FormData): Promise<ActionResult> {
  let stage = "validation"
  try {
    validateActionForm(formData, eventSchema)
    const id = uuid(formData, "id")
    stage = "authorization"
    const { user, companyId } = await actionContext(formData, id ? "events.edit" : "events.create")
    const sql = getSql()
    const title = requiredText(formData, "title", "Título")
    const startsAt = requiredText(formData, "startDate", "Início")
    const endsAt = optionalText(formData, "endDate") ?? startsAt
    const startsAtDate = new Date(startsAt)
    const endsAtDate = new Date(endsAt)
    if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime())) {
      throw new Error("Data ou horário inválido")
    }
    if (endsAtDate < startsAtDate) {
      throw new Error("Fim deve ser igual ou posterior ao início")
    }
    const type = text(formData, "type", "service")
    const status = text(formData, "status", "draft")
    if (!["service", "prayer", "youth", "children", "special", "meeting"].includes(type)) {
      throw new Error("Tipo de evento inválido")
    }
    if (!["draft", "published", "cancelled"].includes(status)) {
      throw new Error("Status de evento inválido")
    }
    const maxCapacity = integer(formData, "maxCapacity")
    if (maxCapacity < 0) throw new Error("Capacidade não pode ser negativa")
    const isOnline = bool(formData, "isOnline")
    const onlineLink = text(formData, "onlineLink")
    if (isOnline) {
      if (!onlineLink) throw new Error("Informe o link do evento online")
      assertHttpUrl(onlineLink, "Link online")
    }
    const volunteerTemplateValue = text(formData, "volunteerTemplateId")
    const volunteerTemplateId = volunteerTemplateValue === "none" ? null : uuid(formData, "volunteerTemplateId")
    if (volunteerTemplateValue && volunteerTemplateValue !== "none" && !volunteerTemplateId) {
      throw new Error("Template de voluntariado inválido")
    }
    if (volunteerTemplateId) {
      stage = "volunteer-template"
      const templates = await sql<{ id: string }[]>`
        select id from public.volunteer_schedule_templates
        where id = ${volunteerTemplateId} and company_id = ${companyId} and is_active and deleted_at is null
        limit 1
      `
      if (!templates[0]?.id) throw new Error("Template de voluntariado não encontrado")
    }

    const ministryValue = text(formData, "ministryId")
    const ministryId = ministryValue === "none" ? null : uuid(formData, "ministryId")
    if (ministryValue && ministryValue !== "none" && !ministryId) throw new Error("Ministério inválido")
    if (ministryId) {
      const ministries = await sql<{ id: string }[]>`
        select id from public.ministries where id = ${ministryId} and company_id = ${companyId} and is_active and deleted_at is null limit 1
      `
      if (!ministries[0]) throw new Error("Ministério não encontrado")
    }

    const registrationFormValue = text(formData, "registrationFormId")
    const registrationFormId = registrationFormValue === "none" ? null : uuid(formData, "registrationFormId")
    if (registrationFormValue && registrationFormValue !== "none" && !registrationFormId) {
      throw new Error("Formulário inválido")
    }
    if (registrationFormId) {
      const forms = await sql<{ id: string }[]>`
        select id from public.forms
        where id = ${registrationFormId} and company_id = ${companyId} and status = 'published' and is_active and deleted_at is null
        limit 1
      `
      if (!forms[0]) throw new Error("Formulário não encontrado")
    }

    const recurrenceFrequency = text(formData, "recurrenceFrequency", "none")
    if (!["none", "weekly", "monthly"].includes(recurrenceFrequency)) throw new Error("Frequência de recorrência inválida")
    const recurrenceEditScope = text(formData, "recurrenceEditScope", "series")
    if (!["occurrence", "following", "series"].includes(recurrenceEditScope)) throw new Error("Escopo de recorrência inválido")
    const recurrenceWeekdays = formData.getAll("recurrenceWeekdays").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    if (recurrenceFrequency === "weekly" && recurrenceWeekdays.length === 0) throw new Error("Escolha ao menos um dia da semana")
    const recurrenceUntil = optionalText(formData, "recurrenceUntil")
    if (recurrenceUntil && !/^\d{4}-\d{2}-\d{2}$/.test(recurrenceUntil)) throw new Error("Data final da recorrência inválida")
    if (recurrenceUntil && recurrenceUntil < startsAt.slice(0, 10)) throw new Error("Término da recorrência deve ser posterior ao início")
    const recurring = recurrenceFrequency !== "none" || bool(formData, "recurring")
    const previousEventRows = id
      ? await sql<{ status: string; title: string; starts_at: Date; ends_at: Date | null; location: string; programming_id: string | null }[]>`
          select status, title, starts_at, ends_at, location, programming_id from public.events where id = ${id} and company_id = ${companyId} and deleted_at is null limit 1
        `
      : []

    stage = "persistence"
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.events
          set title = ${title},
              description = ${text(formData, "description")},
              type = ${type},
              starts_at = ${startsAt},
              ends_at = ${endsAt},
              location = ${text(formData, "location")},
              max_capacity = ${maxCapacity},
              registration_enabled = ${bool(formData, "registrationEnabled")},
              is_public = ${bool(formData, "isPublic", true)},
              is_online = ${isOnline},
              online_link = ${onlineLink},
              volunteer_template_id = ${volunteerTemplateId},
              ministry_id = ${ministryId},
              registration_form_id = ${registrationFormId},
              status = ${status},
              recurring = ${recurring},
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.events (
            company_id, title, description, type, starts_at, ends_at, location,
            max_capacity, registration_enabled, is_public, is_online, online_link, volunteer_template_id, ministry_id, registration_form_id,
            status, recurring, created_by, updated_by
          )
          values (
            ${companyId}, ${title}, ${text(formData, "description")}, ${type},
            ${startsAt}, ${endsAt}, ${text(formData, "location")}, ${maxCapacity},
            ${bool(formData, "registrationEnabled")}, ${bool(formData, "isPublic", true)}, ${isOnline},
            ${onlineLink}, ${volunteerTemplateId}, ${ministryId}, ${registrationFormId}, ${status}, ${recurring},
            ${user.id}, ${user.id}
          )
          returning id
        `

    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Evento não foi salvo")

    const previousProgrammingId = previousEventRows[0]?.programming_id ?? null
    const programmingRows = await sql<{ id: string | null }[]>`select programming_id as id from public.events where id = ${savedId} and company_id = ${companyId} limit 1`
    let programmingId = programmingRows[0]?.id ?? null
    let recurrenceConflict = false
    if (recurrenceEditScope === "occurrence" && previousProgrammingId) {
      await sql`update public.events set programming_id = null, recurring = false, updated_by = ${user.id}, updated_at = now() where id = ${savedId} and company_id = ${companyId}`
      programmingId = null
    } else if (recurrenceFrequency !== "none") {
      const programmingKind = ["service", "meeting"].includes(type) ? type : "other"
      const durationMinutes = Math.max(1, Math.round((endsAtDate.getTime() - startsAtDate.getTime()) / 60000))
      const oldProgrammingId = previousProgrammingId
      await sql.begin(async (tx) => {
        if (recurrenceEditScope === "following" && oldProgrammingId) {
          const createdProgramming = await tx<{ id: string }[]>`
            insert into public.programmings(company_id, title, description, starts_at, duration_minutes, is_recurring, recurrence_rule, kind, location, timezone, recurrence_frequency, recurrence_weekdays, recurrence_until, recurrence_needs_review, volunteer_template_id, source_event_id, is_active, created_by, updated_by)
            values (${companyId}, ${title}, ${text(formData, "description")}, ${startsAt}, ${durationMinutes}, true, ${recurrenceFrequency}, ${programmingKind}, ${text(formData, "location")}, 'America/Sao_Paulo', ${recurrenceFrequency}, ${recurrenceWeekdays}::smallint[], ${recurrenceUntil}::date, false, ${volunteerTemplateId}, ${savedId}, true, ${user.id}, ${user.id})
            returning id
          `
          programmingId = createdProgramming[0]?.id ?? null
          if (!programmingId) throw new Error("Nova série não foi criada")
          await tx`update public.events set programming_id = ${programmingId}, recurring = true, updated_by = ${user.id}, updated_at = now() where id = ${savedId} and company_id = ${companyId}`
          await tx`delete from public.events where programming_id = ${oldProgrammingId} and starts_at >= ${startsAt} and id <> ${savedId} and volunteer_schedule_published_at is null and deleted_at is null`
        } else if (programmingId) {
          await tx`delete from public.events where programming_id = ${programmingId} and id <> ${savedId} and starts_at >= ${startsAt} and volunteer_schedule_published_at is null and deleted_at is null`
          await tx`
            update public.programmings set title = ${title}, description = ${text(formData, "description")}, starts_at = ${startsAt}, duration_minutes = ${durationMinutes}, kind = ${programmingKind}, location = ${text(formData, "location")}, timezone = 'America/Sao_Paulo', recurrence_frequency = ${recurrenceFrequency}, recurrence_weekdays = ${recurrenceWeekdays}::smallint[], recurrence_until = ${recurrenceUntil}::date, recurrence_needs_review = false, is_recurring = true, recurrence_rule = ${recurrenceFrequency}, is_active = true, volunteer_template_id = ${volunteerTemplateId}, updated_by = ${user.id}, updated_at = now()
            where id = ${programmingId} and company_id = ${companyId} and deleted_at is null
          `
        } else {
          const createdProgramming = await tx<{ id: string }[]>`
            insert into public.programmings(company_id, title, description, starts_at, duration_minutes, is_recurring, recurrence_rule, kind, location, timezone, recurrence_frequency, recurrence_weekdays, recurrence_until, recurrence_needs_review, volunteer_template_id, source_event_id, is_active, created_by, updated_by)
            values (${companyId}, ${title}, ${text(formData, "description")}, ${startsAt}, ${durationMinutes}, true, ${recurrenceFrequency}, ${programmingKind}, ${text(formData, "location")}, 'America/Sao_Paulo', ${recurrenceFrequency}, ${recurrenceWeekdays}::smallint[], ${recurrenceUntil}::date, false, ${volunteerTemplateId}, ${savedId}, true, ${user.id}, ${user.id})
            returning id
          `
          programmingId = createdProgramming[0]?.id ?? null
          if (!programmingId) throw new Error("Série não foi criada")
          await tx`update public.events set programming_id = ${programmingId}, recurring = true, updated_by = ${user.id}, updated_at = now() where id = ${savedId} and company_id = ${companyId}`
        }
      })
      await sql`select public.materialize_volunteer_programmings(${companyId}, 90)`
      if (programmingId) {
        const conflicts = await sql<{ count: number }[]>`
          select count(*)::integer as count
          from public.events occurrence
          where occurrence.company_id = ${companyId}
            and occurrence.programming_id = ${programmingId}
            and occurrence.deleted_at is null
            and occurrence.status <> 'cancelled'
            and exists (
              select 1 from public.events other
              where other.company_id = occurrence.company_id
                and other.id <> occurrence.id
                and other.programming_id is distinct from ${programmingId}
                and other.deleted_at is null
                and other.status <> 'cancelled'
                and other.starts_at < coalesce(occurrence.ends_at, occurrence.starts_at + interval '1 hour')
                and coalesce(other.ends_at, other.starts_at + interval '1 hour') > occurrence.starts_at
            )
        `
        recurrenceConflict = Number(conflicts[0]?.count ?? 0) > 0
        if (recurrenceConflict) {
          await sql`update public.programmings set recurrence_needs_review = true, updated_by = ${user.id}, updated_at = now() where id = ${programmingId} and company_id = ${companyId}`
        }
      }
    } else if (programmingId && !recurring) {
      await sql`update public.programmings set recurrence_frequency = 'none', recurrence_weekdays = '{}', recurrence_until = null, is_recurring = false, recurrence_rule = '', is_active = false, updated_by = ${user.id}, updated_at = now() where id = ${programmingId} and company_id = ${companyId}`
    }

    if (volunteerTemplateId) {
      const publishedRows = await sql<{ volunteer_schedule_published_at: Date | null }[]>`select volunteer_schedule_published_at from public.events where id = ${savedId} and company_id = ${companyId} limit 1`
      if (!publishedRows[0]?.volunteer_schedule_published_at) {
        await sql.begin(async (tx) => {
          const slots = await tx<{ department_id: string; role_id: string | null; role_name: string; required_volunteers: number; instructions: string; sort_order: number }[]>`
            select department_id, role_id, role_name, required_volunteers, instructions, sort_order
            from public.volunteer_schedule_template_slots
            where company_id = ${companyId} and template_id = ${volunteerTemplateId} and role_id is not null
            order by sort_order
          `
          await tx`delete from public.volunteer_event_positions where company_id = ${companyId} and event_id = ${savedId}`
          for (const slot of slots) {
            await tx`
              insert into public.volunteer_event_positions(company_id, event_id, department_id, role_id, role_name, required_volunteers, instructions, sort_order, created_by, updated_by)
              values (${companyId}, ${savedId}, ${slot.department_id}, ${slot.role_id}, ${slot.role_name}, ${slot.required_volunteers}, ${slot.instructions}, ${slot.sort_order}, ${user.id}, ${user.id})
              on conflict (event_id, department_id, role_id) do update set role_name = excluded.role_name, required_volunteers = excluded.required_volunteers, instructions = excluded.instructions, sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now()
            `
          }
        })
      }
    }
    stage = "audit"
    await audit("event.save", "events", savedId, companyId, { recurrenceEditScope, recurrenceConflict })
    const previousEvent = previousEventRows[0]
    const publishedChange = previousEvent?.status === "published" && status === "published" && (
      previousEvent.title !== title
      || previousEvent.location !== text(formData, "location")
      || new Date(previousEvent.starts_at).getTime() !== startsAtDate.getTime()
      || new Date(previousEvent.ends_at ?? previousEvent.starts_at).getTime() !== endsAtDate.getTime()
    )
    if (publishedChange) {
      const { scheduleEventCommunication } = await import("@/lib/events/actions")
      const communication = await scheduleEventCommunication({ eventId: savedId, templateKey: "change", channel: "email", audience: "all" })
      if (!communication.ok) console.warn("[events.save] comunicação de alteração não enfileirada", communication.error)
    }
    refresh(["/eventos", "/relatorios", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    console.error("[events.save] failed", {
      stage,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Erro inesperado",
      code: typeof error === "object" && error && "code" in error ? String(error.code) : undefined,
    })
    return toErrorResult(error)
  }
}

export async function deleteEvent(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Evento inválido")
    const { user, companyId } = await actionContext(formData, "events.delete")
    const rows = await getSql()<{ id: string }[]>`
      update public.events
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Evento não encontrado")
    await audit("event.delete", "events", rows[0].id, companyId)
    refresh(["/eventos", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function duplicateEvent(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const sourceId = uuid(formData, "id")
    if (!sourceId) throw new Error("Evento inválido")
    const { user, companyId } = await actionContext(formData, "events.create")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.events (
        company_id, title, description, type, starts_at, ends_at, location, banner_url,
        max_capacity, registration_enabled, is_public, is_online, online_link,
        volunteer_template_id, ministry_id, registration_form_id, status, recurring, created_by, updated_by
      )
      select company_id, left(title || ' (cópia)', 255), description, type, starts_at, ends_at, location, banner_url,
             max_capacity, registration_enabled, is_public, is_online, online_link,
             volunteer_template_id, ministry_id, registration_form_id, 'draft', false, ${user.id}, ${user.id}
      from public.events
      where id = ${sourceId} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Evento não encontrado")
    await audit("event.duplicate", "events", rows[0].id, companyId, { sourceEventId: sourceId })
    refresh(["/eventos", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function setEventStatus(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, eventStatusSchema)
    const id = uuid(formData, "id")
    const status = text(formData, "status")
    if (!id || !["published", "cancelled"].includes(status)) throw new Error("Ação de evento inválida")
    const { user, companyId } = await actionContext(formData, "events.edit")
    const rows = await getSql()<{ id: string }[]>`
      update public.events
      set status = ${status}, updated_by = ${user.id}, updated_at = now()
      where id = ${id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Evento não encontrado")
    await audit(`event.${status === "published" ? "publish" : "cancel"}`, "events", rows[0].id, companyId)
    if (status === "cancelled") {
      const { scheduleEventCommunication } = await import("@/lib/events/actions")
      const communication = await scheduleEventCommunication({
        eventId: rows[0].id,
        templateKey: "cancellation",
        channel: "email",
        audience: "all",
      })
      if (!communication.ok) console.warn("[events.cancel] comunicação não enfileirada", communication.error)
    }
    refresh(["/eventos", `/eventos/${id}`, "/dashboard", "/relatorios"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveAttendanceRecord(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, attendanceSchema)
    const { user, companyId } = await actionContext(formData, "attendance.create")
    const person = await resolvePersonReference(companyId, uuid(formData, "personId"), text(formData, "personName"))
    const occurredOn = requiredText(formData, "date", "Data")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.attendance_records (
        company_id, person_id, person_name, event_type, event_ref_name, occurred_on,
        occurred_time, status, registered_by, registered_by_name
      )
      values (
        ${companyId}, ${person.personId}, ${person.personName}, ${text(formData, "eventType", "service")},
        ${text(formData, "eventRefName")}, ${occurredOn}, ${optionalText(formData, "time")},
        ${text(formData, "status", "present")}, ${user.id}, ${user.name}
      )
      returning id
    `
    await audit("attendance.create", "attendance_records", rows[0].id, companyId)
    refresh(["/presenca", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteAttendanceRecord(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Registro inválido")
    const { companyId } = await actionContext(formData, "attendance.create")
    const rows = await getSql()<{ id: string }[]>`
      update public.attendance_records
      set deleted_at = now(), updated_at = now()
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Registro não encontrado")
    await audit("attendance.delete", "attendance_records", rows[0].id, companyId)
    refresh(["/presenca", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function savePrayerRequest(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, prayerSchema)
    const id = uuid(formData, "id")
    const { user, companyId } = await actionContext(formData, id ? "prayer.edit" : "prayer.create")
    const name = requiredText(formData, "name", "Nome")
    const message = requiredText(formData, "message", "Mensagem")
    const sql = getSql()
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.prayer_requests
          set name = ${name},
              city = ${text(formData, "city")},
              state = ${text(formData, "state")},
              country = ${text(formData, "country", "Brasil")},
              prayer_reason = ${text(formData, "prayerReason", "Pessoal")},
              message = ${message},
              receive_visit = ${bool(formData, "receiveVisit")},
              receive_call = ${bool(formData, "receiveCall")},
              publish_on_wall = ${bool(formData, "publishOnWall", true)},
              status = ${text(formData, "status", "open")},
              is_active = ${bool(formData, "active", true)},
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.prayer_requests (
            company_id, name, city, state, country, prayer_reason, message,
            receive_visit, receive_call, publish_on_wall, status, is_active,
            user_id, user_name, created_by, updated_by
          )
          values (
            ${companyId}, ${name}, ${text(formData, "city")}, ${text(formData, "state")},
            ${text(formData, "country", "Brasil")}, ${text(formData, "prayerReason", "Pessoal")},
            ${message}, ${bool(formData, "receiveVisit")}, ${bool(formData, "receiveCall")},
            ${bool(formData, "publishOnWall", true)}, ${text(formData, "status", "open")},
            ${bool(formData, "active", true)}, ${user.id}, ${user.name}, ${user.id}, ${user.id}
          )
          returning id
        `
    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Pedido não foi salvo")
    await audit("prayer.save", "prayer_requests", savedId, companyId)
    refresh(["/intercessao", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deletePrayerRequest(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Pedido inválido")
    const { user, companyId } = await actionContext(formData, "prayer.delete")
    const rows = await getSql()<{ id: string }[]>`
      update public.prayer_requests
      set deleted_at = now(), is_active = false, updated_by = ${user.id}
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Pedido não encontrado")
    await audit("prayer.delete", "prayer_requests", rows[0].id, companyId)
    refresh(["/intercessao", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveReadingPlan(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, readingPlanSchema)
    const id = uuid(formData, "id")
    const { user, companyId } = await actionContext(formData, "content.create")
    const name = requiredText(formData, "name", "Nome")
    const objectives = JSON.stringify(list(formData, "objectives"))
    const sql = getSql()
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.reading_plans
          set name = ${name},
              description = ${text(formData, "description")},
              cover_image_url = ${text(formData, "coverImage")},
              objectives = ${objectives}::jsonb,
              period = ${text(formData, "period")},
              target_audience = ${text(formData, "targetAudience")},
              status = ${text(formData, "status", "draft")},
              is_active = ${bool(formData, "active", true)},
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.reading_plans (
            company_id, name, description, cover_image_url, objectives, period,
            target_audience, status, is_active, created_by, updated_by
          )
          values (
            ${companyId}, ${name}, ${text(formData, "description")}, ${text(formData, "coverImage")},
            ${objectives}::jsonb, ${text(formData, "period")}, ${text(formData, "targetAudience")},
            ${text(formData, "status", "draft")}, ${bool(formData, "active", true)}, ${user.id}, ${user.id}
          )
          returning id
        `
    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Plano não foi salvo")
    await attachOperationalMediaFile(formData, {
      fileKey: "coverFile",
      companyId,
      userId: user.id,
      entityTable: "reading_plans",
      entityId: savedId,
      purpose: "cover",
      fileColumn: "cover_file_id",
    })
    await audit("reading_plan.save", "reading_plans", savedId, companyId)
    refresh(["/discipulado", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteReadingPlan(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Plano inválido")
    const { user, companyId } = await actionContext(formData, "content.edit")
    const rows = await getSql()<{ id: string }[]>`
      update public.reading_plans
      set deleted_at = now(), is_active = false, updated_by = ${user.id}
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Plano não encontrado")
    await audit("reading_plan.delete", "reading_plans", rows[0].id, companyId)
    refresh(["/discipulado", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveReadingPlanStep(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, readingPlanStepSchema)
    const id = uuid(formData, "id")
    const planId = uuid(formData, "planId")
    if (!planId) throw new Error("Plano inválido")
    const { companyId } = await actionContext(formData, id ? "content.edit" : "content.create")
    const dayNumber = integer(formData, "dayNumber", 0)
    if (dayNumber <= 0) throw new Error("Dia inválido")
    const title = requiredText(formData, "title", "Título")
    const content = text(formData, "content")
    const scriptureRef = text(formData, "scriptureRef")
    const sql = getSql()

    const planRows = await sql<{ id: string }[]>`
      select id
      from public.reading_plans
      where id = ${planId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!planRows[0]?.id) throw new Error("Plano não encontrado")

    const rows = id
      ? await sql<{ id: string }[]>`
          update public.reading_plan_steps
          set day_number = ${dayNumber},
              title = ${title},
              content = ${content},
              scripture_ref = ${scriptureRef},
              updated_at = now()
          where id = ${id}
            and plan_id = ${planId}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.reading_plan_steps (
            company_id, plan_id, day_number, title, content, scripture_ref
          )
          values (
            ${companyId}, ${planId}, ${dayNumber}, ${title}, ${content}, ${scriptureRef}
          )
          on conflict (plan_id, day_number)
          do update set
            title = excluded.title,
            content = excluded.content,
            scripture_ref = excluded.scripture_ref,
            deleted_at = null,
            updated_at = now()
          returning id
        `

    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Etapa não foi salva")
    await audit("reading_plan_step.save", "reading_plan_steps", savedId, companyId)
    refresh(["/discipulado", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteReadingPlanStep(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Etapa inválida")
    const { companyId } = await actionContext(formData, "content.edit")
    const rows = await getSql()<{ id: string }[]>`
      update public.reading_plan_steps
      set deleted_at = now(), updated_at = now()
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Etapa não encontrada")
    await audit("reading_plan_step.delete", "reading_plan_steps", rows[0].id, companyId)
    refresh(["/discipulado", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveAnnouncement(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, announcementSchema)
    const id = uuid(formData, "id")
    const { user, companyId } = await actionContext(formData, id ? "communication.edit" : "communication.create")
    const title = requiredText(formData, "title", "Título")
    const content = requiredText(formData, "content", "Conteúdo")
    const published = bool(formData, "published")
    const sql = getSql()
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.announcements
          set title = ${title},
              content = ${content},
              priority = ${text(formData, "priority", "medium")},
              published = ${published},
              published_at = case when ${published} then coalesce(published_at, now()) else null end,
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.announcements (
            company_id, title, content, author_id, author_name, priority,
            published, published_at, created_by, updated_by
          )
          values (
            ${companyId}, ${title}, ${content}, ${user.id}, ${user.name},
            ${text(formData, "priority", "medium")}, ${published}, ${published ? "now" : null},
            ${user.id}, ${user.id}
          )
          returning id
        `
    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Aviso não foi salvo")
    await audit("announcement.save", "announcements", savedId, companyId)
    refresh(["/comunicacao", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteAnnouncement(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Aviso inválido")
    const { user, companyId } = await actionContext(formData, "communication.delete")
    const rows = await getSql()<{ id: string }[]>`
      update public.announcements
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Aviso não encontrado")
    await audit("announcement.delete", "announcements", rows[0].id, companyId)
    refresh(["/comunicacao", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveNotification(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, notificationSchema)
    const { user, companyId } = await actionContext(formData, "notification.create")
    const title = requiredText(formData, "title", "Título")
    const content = requiredText(formData, "content", "Conteúdo")
    const method = text(formData, "method", "push") as "push" | "email" | "whatsapp"
    const audience = text(formData, "audience", "all") as "all" | "cell" | "ministry" | "visitors" | "birthdays" | "manual"
    const audienceRefId = optionalText(formData, "audienceRefId")
    const personIds = list(formData, "audiencePersonIds")
    const scheduledAtInput = optionalText(formData, "scheduledAt")
    if (scheduledAtInput && Number.isNaN(Date.parse(scheduledAtInput))) throw new Error("Data de agendamento inválida")
    const scheduledAt = scheduledAtInput ? new Date(scheduledAtInput).toISOString() : null
    if (scheduledAt && Date.parse(scheduledAt) <= Date.now()) throw new Error("Agendamento deve estar no futuro")
    const scheduled = Boolean(scheduledAt)
    const sendDate = scheduledAt ? scheduledAt.slice(0, 10) : optionalText(formData, "sendDate")
    const rows = await getSql().begin(async (tx) => {
      const campaigns = await tx<{ id: string }[]>`
        insert into public.notifications (
          company_id, title, content, method, type, target_group, scheduled_send,
          send_date, scheduled_at, audience_kind, audience_ref_id, audience_person_ids,
          snapshot_at, snapshot_count, status, created_by, updated_by
        )
        values (
          ${companyId}, ${title}, ${content}, ${method}, ${audience === "birthdays" ? "birthday" : audience === "all" ? "general" : "group"},
          ${audienceRefId ?? ""}, ${scheduled}, ${sendDate}, ${scheduledAt}, ${audience}, ${audienceRefId},
          ${tx.json(personIds)}, now(), 0, ${scheduled ? "scheduled" : "queued"}, ${user.id}, ${user.id}
        )
        returning id
      `
      const campaign = campaigns[0]
      if (!campaign?.id) throw new Error("Campanha não foi criada")
      const snapshot = await createNotificationCampaignDeliveries(tx, {
        notificationId: campaign.id,
        companyId,
        channel: method,
        audience,
        audienceRefId,
        personIds,
        nextAttemptAt: scheduledAt,
      })
      await tx`
        update public.notifications
        set snapshot_count = ${snapshot.deliveryCount}, snapshot_at = now(), updated_at = now()
        where id = ${campaign.id} and company_id = ${companyId}
      `
      return { id: campaign.id, snapshot }
    })
    await audit("notification.create", "notifications", rows.id, companyId)
    refresh(["/notificacao", "/dashboard"])
    return { ok: true, id: rows.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveNotificationGroup(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, notificationGroupSchema)
    const { user, companyId } = await actionContext(formData, "notification.create")
    const name = requiredText(formData, "name", "Nome")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.notification_groups (company_id, name, is_active, created_by, updated_by)
      values (${companyId}, ${name}, ${bool(formData, "active", true)}, ${user.id}, ${user.id})
      returning id
    `
    await audit("notification_group.create", "notification_groups", rows[0].id, companyId)
    refresh(["/notificacao", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

function slugifyStageKey(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "coluna"
  )
}

async function resolveCrmStageId(companyId: string, stageId: string | null) {
  const sql = getSql()
  if (stageId) {
    const rows = await sql<{ id: string }[]>`
      select id
      from public.crm_stages
      where id = ${stageId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!rows[0]?.id) throw new Error("Coluna do Kanban não encontrada")
    return rows[0].id
  }

  const defaults = await sql<{ id: string }[]>`
    select id
    from public.crm_stages
    where company_id = ${companyId}
      and deleted_at is null
    order by is_default desc, sort_order, created_at
    limit 1
  `
  if (!defaults[0]?.id) throw new Error("Nenhuma coluna do Kanban configurada")
  return defaults[0].id
}

export async function saveCrmStage(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, crmStageSchema)
    const id = uuid(formData, "id")
    const { user, companyId } = await actionContext(formData, "crm.edit")
    const name = requiredText(formData, "name", "Nome")
    const color = text(formData, "color", "#6366f1") || "#6366f1"
    const sortOrder = integer(formData, "sortOrder", 0)
    const isDefault = bool(formData, "isDefault", false)
    const sql = getSql()

    if (isDefault) {
      if (id) {
        await sql`
          update public.crm_stages
          set is_default = false, updated_by = ${user.id}
          where company_id = ${companyId}
            and deleted_at is null
            and id <> ${id}
        `
      } else {
        await sql`
          update public.crm_stages
          set is_default = false, updated_by = ${user.id}
          where company_id = ${companyId}
            and deleted_at is null
        `
      }
    }

    if (id) {
      const rows = await sql<{ id: string }[]>`
        update public.crm_stages
        set name = ${name},
            color = ${color},
            sort_order = ${sortOrder},
            is_default = ${isDefault},
            updated_by = ${user.id}
        where id = ${id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      if (!rows[0]?.id) throw new Error("Coluna não encontrada")
      await audit("crm_stage.save", "crm_stages", rows[0].id, companyId)
      refresh(["/crm", "/formularios", "/dashboard"])
      return { ok: true, id: rows[0].id }
    }

    let key = slugifyStageKey(name)
    const existing = await sql<{ key: string }[]>`
      select key from public.crm_stages
      where company_id = ${companyId} and deleted_at is null
    `
    const used = new Set(existing.map((row) => row.key))
    if (used.has(key)) {
      let n = 2
      while (used.has(`${key}-${n}`)) n += 1
      key = `${key}-${n}`
    }

    const maxSort = await sql<{ max: number | null }[]>`
      select max(sort_order) as max from public.crm_stages
      where company_id = ${companyId} and deleted_at is null
    `
    const nextSort = sortOrder || (Number(maxSort[0]?.max ?? 0) + 10)

    const rows = await sql<{ id: string }[]>`
      insert into public.crm_stages (
        company_id, key, name, color, sort_order, is_default, created_by, updated_by
      )
      values (
        ${companyId}, ${key}, ${name}, ${color}, ${nextSort}, ${isDefault}, ${user.id}, ${user.id}
      )
      returning id
    `
    await audit("crm_stage.save", "crm_stages", rows[0].id, companyId)
    refresh(["/crm", "/formularios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteCrmStage(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteCrmStageSchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Coluna inválida")
    const reassignStageId = uuid(formData, "reassignStageId")
    const { user, companyId } = await actionContext(formData, "crm.edit")
    const sql = getSql()

    const stageRows = await sql<{ id: string; is_default: boolean }[]>`
      select id, is_default
      from public.crm_stages
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!stageRows[0]) throw new Error("Coluna não encontrada")

    const remaining = await sql<{ id: string }[]>`
      select id from public.crm_stages
      where company_id = ${companyId}
        and deleted_at is null
        and id <> ${id}
      order by is_default desc, sort_order
    `
    if (remaining.length === 0) {
      throw new Error("Não é possível excluir a última coluna do Kanban")
    }

    const cardCount = await sql<{ count: number }[]>`
      select count(*)::int as count
      from public.crm_cards
      where company_id = ${companyId}
        and stage_id = ${id}
        and deleted_at is null
    `
    const count = Number(cardCount[0]?.count ?? 0)
    if (count > 0) {
      if (!reassignStageId) {
        throw new Error("Mova os cards para outra coluna antes de excluir")
      }
      if (reassignStageId === id) {
        throw new Error("Selecione uma coluna de destino diferente")
      }
      const target = remaining.find((row) => row.id === reassignStageId)
      if (!target) throw new Error("Coluna de destino inválida")
      await sql`
        update public.crm_cards
        set stage_id = ${reassignStageId}, updated_by = ${user.id}
        where company_id = ${companyId}
          and stage_id = ${id}
          and deleted_at is null
      `
    }

    await sql`
      update public.crm_stages
      set deleted_at = now(), updated_by = ${user.id}, is_default = false
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
    `

    if (stageRows[0].is_default) {
      await sql`
        update public.crm_stages
        set is_default = true, updated_by = ${user.id}
        where id = ${remaining[0].id}
          and company_id = ${companyId}
          and deleted_at is null
      `
    }

    await audit("crm_stage.delete", "crm_stages", id, companyId)
    refresh(["/crm", "/formularios", "/dashboard"])
    return { ok: true, id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveCrmCard(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, crmCardSchema)
    const id = uuid(formData, "id")
    const { user, companyId } = await actionContext(formData, "crm.edit")
    const person = await resolvePersonReference(companyId, uuid(formData, "personId"), text(formData, "personName"))
    const personPhone = text(formData, "personPhone") || person.personPhone
    const personEmail = text(formData, "personEmail") || person.personEmail
    const stageId = await resolveCrmStageId(companyId, uuid(formData, "stageId"))
    const sql = getSql()
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.crm_cards
          set person_id = ${person.personId},
              person_name = ${person.personName},
              person_phone = ${personPhone},
              person_email = ${personEmail},
              stage_id = ${stageId},
              source = ${text(formData, "source")},
              assigned_to_name = ${text(formData, "assignedToName")},
              last_contact = ${optionalText(formData, "lastContact")},
              notes = ${text(formData, "notes")},
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.crm_cards (
            company_id, person_id, person_name, person_phone, person_email, stage_id, source,
            assigned_to_name, last_contact, notes, created_by, updated_by
          )
          values (
            ${companyId}, ${person.personId}, ${person.personName}, ${personPhone}, ${personEmail},
            ${stageId}, ${text(formData, "source")}, ${text(formData, "assignedToName")},
            ${optionalText(formData, "lastContact")}, ${text(formData, "notes")}, ${user.id}, ${user.id}
          )
          returning id
        `
    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Card não foi salvo")
    await audit("crm_card.save", "crm_cards", savedId, companyId)

    try {
      const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
      const eventType = id ? "crm.card.updated" : "crm.card.created"
      await enqueueIntegrationEventSafe({
        companyId,
        eventType,
        eventKey: `${eventType}:${savedId}:${Date.now()}`,
        data: {
          crmCard: {
            id: savedId,
            personId: person.personId,
            personName: person.personName,
            personPhone,
            personEmail,
            stageId,
            source: text(formData, "source"),
            notes: text(formData, "notes"),
          },
        },
      })
      afterResponse("integration outbox", async () => {
        const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
        await processIntegrationOutbox(25)
      })
    } catch (integrationError) {
      console.error("[integrations] crm card emit failed", integrationError)
    }

    refresh(["/crm", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

const movePersonToKanbanSchema = z.object({
  personId: requiredUuidField,
  stageId: optionalUuidField,
})

export async function movePersonToKanbanStage(input: {
  personId: string
  stageId?: string | null
}): Promise<ActionResult> {
  try {
    const parsed = movePersonToKanbanSchema.parse({
      personId: input.personId,
      stageId: input.stageId ?? undefined,
    })
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, null)
    await requirePermission("crm.edit", companyId)

    const person = await resolvePersonReference(companyId, parsed.personId, "")
    const stageId = await resolveCrmStageId(companyId, parsed.stageId || null)
    const sql = getSql()
    const existing = await sql<{ id: string }[]>`
      select id
      from public.crm_cards
      where company_id = ${companyId}
        and person_id = ${parsed.personId}
        and deleted_at is null
      order by created_at desc
      limit 1
    `
    const existingId = existing[0]?.id
    const rows = existingId
      ? await sql<{ id: string }[]>`
          update public.crm_cards
          set stage_id = ${stageId},
              person_name = ${person.personName},
              person_phone = ${person.personPhone},
              person_email = ${person.personEmail},
              updated_by = ${user.id}
          where id = ${existingId}
            and company_id = ${companyId}
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.crm_cards (
            company_id, person_id, person_name, person_phone, person_email, stage_id, source,
            assigned_to_name, last_contact, notes, created_by, updated_by
          )
          values (
            ${companyId}, ${parsed.personId}, ${person.personName}, ${person.personPhone}, ${person.personEmail},
            ${stageId}, 'pessoas', '', null, '', ${user.id}, ${user.id}
          )
          returning id
        `
    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Card não foi salvo")
    await audit("crm_card.save", "crm_cards", savedId, companyId)
    refresh(["/crm", "/dashboard"])
    return { ok: true, id: savedId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteCrmCard(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Card inválido")
    const { user, companyId } = await actionContext(formData, "crm.edit")
    const rows = await getSql()<{ id: string }[]>`
      update public.crm_cards
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Card não encontrado")
    await audit("crm_card.delete", "crm_cards", rows[0].id, companyId)
    refresh(["/crm", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveRevenue(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, revenueSchema)
    const { user, companyId } = await actionContext(formData, "finance.create")
    const amount = money(formData, "amount")
    if (amount <= 0) throw new Error("Valor obrigatório")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.revenues (
        company_id, amount, category, subcategory, received_from, received_from_name,
        description, cost_center, bank_account, payment_method, due_date, payment_date,
        received, notes, created_by, updated_by
      )
      values (
        ${companyId}, ${amount}, ${text(formData, "category")}, ${text(formData, "subcategory")},
        ${text(formData, "receivedFrom", "person")}, ${text(formData, "receivedFromName")},
        ${requiredText(formData, "description", "Descrição")}, ${text(formData, "costCenter")},
        ${text(formData, "bankAccount")}, ${text(formData, "paymentMethod")},
        ${optionalText(formData, "dueDate")}, ${requiredText(formData, "paymentDate", "Data de pagamento")},
        ${bool(formData, "received", true)}, ${text(formData, "notes")}, ${user.id}, ${user.id}
      )
      returning id
    `
    await attachReceiptFile(formData, { companyId, userId: user.id, entityTable: "revenues", entityId: rows[0].id })
    await audit("revenue.create", "revenues", rows[0].id, companyId)
    refresh(["/financeiro", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveExpense(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, expenseSchema)
    const { user, companyId } = await actionContext(formData, "finance.create")
    const amount = money(formData, "amount")
    if (amount <= 0) throw new Error("Valor obrigatório")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.expenses (
        company_id, amount, category, subcategory, paid_to, paid_to_name,
        description, cost_center, bank_account, payment_method, due_date, payment_date,
        paid, notes, created_by, updated_by
      )
      values (
        ${companyId}, ${amount}, ${text(formData, "category")}, ${text(formData, "subcategory")},
        'supplier', ${text(formData, "paidToName")}, ${requiredText(formData, "description", "Descrição")},
        ${text(formData, "costCenter")}, ${text(formData, "bankAccount")}, ${text(formData, "paymentMethod")},
        ${optionalText(formData, "dueDate")}, ${requiredText(formData, "paymentDate", "Data de pagamento")},
        ${bool(formData, "paid", true)}, ${text(formData, "notes")}, ${user.id}, ${user.id}
      )
      returning id
    `
    await attachReceiptFile(formData, { companyId, userId: user.id, entityTable: "expenses", entityId: rows[0].id })
    await audit("expense.create", "expenses", rows[0].id, companyId)
    refresh(["/financeiro", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteRevenue(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Lançamento inválido")
    const { user, companyId } = await actionContext(formData, "finance.delete")
    const rows = await getSql()<{ id: string }[]>`
      update public.revenues
      set deleted_at = now(), updated_by = ${user.id}, updated_at = now()
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Receita não encontrada")
    await audit("revenue.delete", "revenues", rows[0].id, companyId)
    refresh(["/financeiro", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteExpense(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, deleteEntitySchema)
    const id = uuid(formData, "id")
    if (!id) throw new Error("Lançamento inválido")
    const { user, companyId } = await actionContext(formData, "finance.delete")
    const rows = await getSql()<{ id: string }[]>`
      update public.expenses
      set deleted_at = now(), updated_by = ${user.id}, updated_at = now()
      where id = ${id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Despesa não encontrada")
    await audit("expense.delete", "expenses", rows[0].id, companyId)
    refresh(["/financeiro", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveFinancialCategory(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, financialCategorySchema)
    const { user, companyId } = await actionContext(formData, "finance.edit")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.financial_categories (company_id, name, color, type, is_active, created_by, updated_by)
      values (${companyId}, ${requiredText(formData, "name", "Nome")}, ${text(formData, "color", "#10b981")}, ${text(formData, "type", "revenue")}, true, ${user.id}, ${user.id})
      on conflict (company_id, type, name)
      do update set color = excluded.color, is_active = true, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `
    await audit("financial_category.save", "financial_categories", rows[0].id, companyId)
    refresh(["/financeiro"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveCostCenter(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, costCenterSchema)
    const { user, companyId } = await actionContext(formData, "finance.edit")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.cost_centers (company_id, title, description, responsible, is_active, created_by, updated_by)
      values (${companyId}, ${requiredText(formData, "title", "Título")}, ${text(formData, "description")}, ${text(formData, "responsible")}, ${bool(formData, "active", true)}, ${user.id}, ${user.id})
      returning id
    `
    await audit("cost_center.create", "cost_centers", rows[0].id, companyId)
    refresh(["/financeiro"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveBankAccount(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, bankAccountSchema)
    const { user, companyId } = await actionContext(formData, "finance.edit")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.bank_accounts (
        company_id, description, bank, account_type, initial_balance, agency,
        account, digit, is_active, created_by, updated_by
      )
      values (
        ${companyId}, ${requiredText(formData, "description", "Descrição")}, ${text(formData, "bank")},
        ${text(formData, "accountType")}, ${money(formData, "initialBalance")}, ${text(formData, "agency")},
        ${text(formData, "account")}, ${text(formData, "digit")}, ${bool(formData, "active", true)}, ${user.id}, ${user.id}
      )
      returning id
    `
    await audit("bank_account.create", "bank_accounts", rows[0].id, companyId)
    refresh(["/financeiro"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSupplier(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, supplierSchema)
    const { user, companyId } = await actionContext(formData, "finance.edit")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.suppliers (company_id, name, document, responsible, phone, email, is_active, created_by, updated_by)
      values (${companyId}, ${requiredText(formData, "name", "Nome")}, ${text(formData, "document")}, ${text(formData, "responsible")}, ${text(formData, "phone")}, ${text(formData, "email")}, ${bool(formData, "active", true)}, ${user.id}, ${user.id})
      returning id
    `
    await audit("supplier.create", "suppliers", rows[0].id, companyId)
    refresh(["/financeiro"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveDonation(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, donationSchema)
    const { user, companyId } = await actionContext(formData, "donation.create")
    const amount = money(formData, "amount")
    if (amount <= 0) throw new Error("Valor obrigatório")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.donations (company_id, donor_name, amount, reason, method, donated_on, status, created_by, updated_by)
      values (${companyId}, ${text(formData, "donorName")}, ${amount}, ${text(formData, "reason")}, ${text(formData, "method", "pix")}, ${requiredText(formData, "date", "Data")}, ${text(formData, "status", "confirmed")}, ${user.id}, ${user.id})
      returning id
    `
    await attachReceiptFile(formData, { companyId, userId: user.id, entityTable: "donations", entityId: rows[0].id })
    await audit("donation.create", "donations", rows[0].id, companyId)
    refresh(["/doacao", "/relatorios", "/dashboard"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveDonationRecurrence(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, donationRecurrenceSchema)
    const { user, companyId } = await actionContext(formData, "donation.create")
    const amount = money(formData, "amount")
    if (amount <= 0) throw new Error("Valor obrigatório")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.donation_recurrences (company_id, user_name, reason, amount, frequency, is_active, pending, created_by, updated_by)
      values (${companyId}, ${requiredText(formData, "userName", "Usuário")}, ${text(formData, "reason")}, ${amount}, ${text(formData, "frequency", "monthly")}, ${bool(formData, "active", true)}, ${bool(formData, "pending")}, ${user.id}, ${user.id})
      returning id
    `
    await audit("donation_recurrence.create", "donation_recurrences", rows[0].id, companyId)
    refresh(["/doacao"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSubscriptionPlan(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, subscriptionPlanSchema)
    const { user, companyId } = await actionContext(formData, "subscription.create")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.subscription_plans (
        company_id, code, name, description, billing_cycle, billing_interval,
        auto_renew, discount_type, discount_value, price, signup_fee, is_active,
        created_by, updated_by
      )
      values (
        ${companyId}, ${requiredText(formData, "code", "Código")}, ${requiredText(formData, "name", "Nome")},
        ${text(formData, "description")}, ${text(formData, "billingCycle", "monthly")}, 1,
        ${bool(formData, "autoRenew", true)}, ${text(formData, "discountType", "none")},
        ${money(formData, "discountValue")}, ${money(formData, "price")}, ${money(formData, "signupFee")},
        ${bool(formData, "active", true)}, ${user.id}, ${user.id}
      )
      on conflict (company_id, code)
      do update set name = excluded.name, description = excluded.description, price = excluded.price, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `
    await audit("subscription_plan.save", "subscription_plans", rows[0].id, companyId)
    refresh(["/inpeace-play"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSubscriptionTag(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, subscriptionTagSchema)
    const { user, companyId } = await actionContext(formData, "subscription.edit")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.subscription_tags (company_id, name, created_by, updated_by)
      values (${companyId}, ${requiredText(formData, "name", "Nome")}, ${user.id}, ${user.id})
      on conflict (company_id, name)
      do update set deleted_at = null, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `
    await audit("subscription_tag.save", "subscription_tags", rows[0].id, companyId)
    refresh(["/inpeace-play"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSubscription(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, subscriptionSchema)
    const { user, companyId } = await actionContext(formData, "subscription.create")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.subscriptions (
        company_id, user_name, plan_id, plan_name, price, start_date, end_date, status,
        created_by, updated_by
      )
      values (
        ${companyId}, ${text(formData, "userName")}, ${uuid(formData, "planId")},
        ${text(formData, "planName")}, ${money(formData, "price")},
        ${requiredText(formData, "startDate", "Data início")}, ${optionalText(formData, "endDate")},
        ${text(formData, "status", "active")}, ${user.id}, ${user.id}
      )
      returning id
    `
    await audit("subscription.create", "subscriptions", rows[0].id, companyId)
    refresh(["/inpeace-play"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSubscriptionContent(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, subscriptionContentSchema)
    const { user, companyId } = await actionContext(formData, "subscription.create")
    const tags = JSON.stringify(list(formData, "tags"))
    const rows = await getSql()<{ id: string }[]>`
      insert into public.subscription_contents (
        company_id, title, description, tags, production_year, content_type, content_code,
        is_draft, is_featured, is_coming_soon, is_active, created_by, updated_by
      )
      values (
        ${companyId}, ${requiredText(formData, "title", "Título")}, ${text(formData, "description")},
        ${tags}::jsonb, ${text(formData, "productionYear")}, ${text(formData, "contentType", "youtube")},
        ${text(formData, "contentCode")}, ${bool(formData, "isDraft")}, ${bool(formData, "isFeatured")},
        ${bool(formData, "isComingSoon")}, ${bool(formData, "active", true)}, ${user.id}, ${user.id}
      )
      returning id
    `
    await attachOperationalMediaFile(formData, {
      fileKey: "highlightFile",
      companyId,
      userId: user.id,
      entityTable: "subscription_contents",
      entityId: rows[0].id,
      purpose: "highlight",
      fileColumn: "highlight_file_id",
    })
    await attachOperationalMediaFile(formData, {
      fileKey: "coverFile",
      companyId,
      userId: user.id,
      entityTable: "subscription_contents",
      entityId: rows[0].id,
      purpose: "cover",
      fileColumn: "cover_file_id",
    })
    await audit("subscription_content.create", "subscription_contents", rows[0].id, companyId)
    refresh(["/inpeace-play"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSubscriptionCollection(formData: FormData): Promise<ActionResult> {
  try {
    validateActionForm(formData, subscriptionCollectionSchema)
    const { user, companyId } = await actionContext(formData, "subscription.create")
    const tags = JSON.stringify(list(formData, "tags"))
    const rows = await getSql()<{ id: string }[]>`
      insert into public.subscription_collections (
        company_id, title, description, tags, is_featured, is_coming_soon,
        is_active, created_by, updated_by
      )
      values (
        ${companyId}, ${requiredText(formData, "title", "Título")}, ${text(formData, "description")},
        ${tags}::jsonb, ${bool(formData, "isFeatured")}, ${bool(formData, "isComingSoon")},
        ${bool(formData, "active", true)}, ${user.id}, ${user.id}
      )
      returning id
    `
    await attachOperationalMediaFile(formData, {
      fileKey: "highlightFile",
      companyId,
      userId: user.id,
      entityTable: "subscription_collections",
      entityId: rows[0].id,
      purpose: "highlight",
      fileColumn: "highlight_file_id",
    })
    await attachOperationalMediaFile(formData, {
      fileKey: "coverFile",
      companyId,
      userId: user.id,
      entityTable: "subscription_collections",
      entityId: rows[0].id,
      purpose: "cover",
      fileColumn: "cover_file_id",
    })
    await audit("subscription_collection.create", "subscription_collections", rows[0].id, companyId)
    refresh(["/inpeace-play"])
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}
