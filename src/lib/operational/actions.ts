"use server"

import { revalidatePath } from "next/cache"
import { afterResponse } from "@/lib/performance/after-response"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { getOptionalFile, uploadManagedFile } from "@/lib/files/server"
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
  return text(formData, key)
    .split(",")
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

async function audit(action: string, entityTable: string, entityId: string, companyId: string) {
  await writeAuditLog({ action, entityTable, entityId, companyId, metadata: {} })
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
    const volunteerTemplateValue = text(formData, "volunteerTemplateId")
    const volunteerTemplateId = volunteerTemplateValue === "none" ? null : uuid(formData, "volunteerTemplateId")
    if (volunteerTemplateValue && !volunteerTemplateId) throw new Error("Template de voluntariado inválido")
    if (volunteerTemplateId) {
      stage = "volunteer-template"
      const templates = await sql<{ id: string }[]>`
        select id from public.volunteer_schedule_templates
        where id = ${volunteerTemplateId} and company_id = ${companyId} and is_active and deleted_at is null
        limit 1
      `
      if (!templates[0]?.id) throw new Error("Template de voluntariado não encontrado")
    }

    stage = "persistence"
    const rows = id
      ? await sql<{ id: string }[]>`
          update public.events
          set title = ${title},
              description = ${text(formData, "description")},
              type = ${text(formData, "type", "service")},
              starts_at = ${startsAt},
              ends_at = ${endsAt},
              location = ${text(formData, "location")},
              max_capacity = ${integer(formData, "maxCapacity")},
              registration_enabled = ${bool(formData, "registrationEnabled")},
              is_public = ${bool(formData, "isPublic", true)},
              is_online = ${bool(formData, "isOnline")},
              online_link = ${text(formData, "onlineLink")},
              volunteer_template_id = ${volunteerTemplateId},
              status = ${text(formData, "status", "published")},
              recurring = ${bool(formData, "recurring")},
              updated_by = ${user.id}
          where id = ${id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.events (
            company_id, title, description, type, starts_at, ends_at, location,
            max_capacity, registration_enabled, is_public, is_online, online_link, volunteer_template_id,
            status, recurring, created_by, updated_by
          )
          values (
            ${companyId}, ${title}, ${text(formData, "description")}, ${text(formData, "type", "service")},
            ${startsAt}, ${endsAt}, ${text(formData, "location")}, ${integer(formData, "maxCapacity")},
            ${bool(formData, "registrationEnabled")}, ${bool(formData, "isPublic", true)}, ${bool(formData, "isOnline")},
            ${text(formData, "onlineLink")}, ${volunteerTemplateId}, ${text(formData, "status", "published")}, ${bool(formData, "recurring")},
            ${user.id}, ${user.id}
          )
          returning id
        `

    const savedId = rows[0]?.id
    if (!savedId) throw new Error("Evento não foi salvo")
    stage = "audit"
    await audit("event.save", "events", savedId, companyId)
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
    const scheduled = bool(formData, "scheduledSend")
    const rows = await getSql()<{ id: string }[]>`
      insert into public.notifications (
        company_id, title, content, method, type, target_group, scheduled_send,
        send_date, status, created_by, updated_by
      )
      values (
        ${companyId}, ${title}, ${content}, ${text(formData, "method", "push")},
        ${text(formData, "type", "general")}, ${text(formData, "targetGroup")},
        ${scheduled}, ${optionalText(formData, "sendDate")},
        ${scheduled ? "scheduled" : "draft"}, ${user.id}, ${user.id}
      )
      returning id
    `
    await audit("notification.create", "notifications", rows[0].id, companyId)
    refresh(["/notificacao", "/dashboard"])
    return { ok: true, id: rows[0].id }
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
