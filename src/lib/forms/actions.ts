"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { jsonbParam } from "@/lib/db/jsonb"
import type {
  FormFieldMapTo,
  FormFieldType,
  FormsActionResult,
  PublicSubmitInput,
  SaveFormFieldInput,
  SaveFormInput,
} from "./types"

// Zod 4: missing object keys are not covered by z.undefined() inside a union.
// Use .optional() so create flows can omit id / companyId / targetStageId.
const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const formStatusSchema = z.enum(["draft", "published", "archived"])
const fieldTypeSchema = z.enum([
  "text",
  "email",
  "phone",
  "textarea",
  "number",
  "select",
  "checkbox",
  "date",
])
const mapToSchema = z.enum(["person_name", "person_email", "person_phone", "notes", "none"])

const saveFormSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  title: z.string().trim().min(2, "Título obrigatório"),
  slug: z.string().trim().optional().default(""),
  description: z.string().trim().optional().default(""),
  status: formStatusSchema.optional().default("draft"),
  targetStageId: nullableUuidSchema,
  successMessage: z.string().trim().optional().default("Obrigado! Recebemos suas informações."),
  submitButtonLabel: z.string().trim().optional().default("Enviar"),
  createPerson: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
})

const saveFieldSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  formId: z.string().uuid(),
  fieldType: fieldTypeSchema,
  label: z.string().trim().min(1, "Rótulo obrigatório"),
  fieldKey: z.string().trim().optional().default(""),
  placeholder: z.string().trim().optional().default(""),
  helpText: z.string().trim().optional().default(""),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional().default([]),
  mapTo: mapToSchema.optional().default("none"),
  sortOrder: z.number().int().optional().default(0),
})

const deleteSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

const reorderSchema = z.object({
  formId: z.string().uuid(),
  companyId: nullableUuidSchema,
  orderedIds: z.array(z.string().uuid()).min(1),
})

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "formulario"
  )
}

function fieldKeyify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "campo"
  )
}

function toErrorResult(error: unknown): FormsActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

async function resolveActionCompanyId(inputCompanyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, inputCompanyId)
  return { user, companyId }
}

async function getCompanySlug(companyId: string) {
  const sql = getSql()
  const rows = await sql<{ slug: string }[]>`
    select slug from public.companies where id = ${companyId} limit 1
  `
  return rows[0]?.slug ?? null
}

async function revalidateForms(companySlug?: string | null, formSlug?: string | null) {
  revalidatePath("/formularios")
  revalidatePath("/crm")
  revalidatePath("/dashboard")
  if (companySlug && formSlug) {
    revalidatePath(`/f/${companySlug}/${formSlug}`)
  }
}

async function ensureUniqueFormSlug(companyId: string, baseSlug: string, excludeId?: string | null) {
  const sql = getSql()
  let slug = slugify(baseSlug)
  let attempt = 1
  while (true) {
    const rows = excludeId
      ? await sql<{ id: string }[]>`
          select id from public.forms
          where company_id = ${companyId}
            and slug = ${slug}
            and deleted_at is null
            and id <> ${excludeId}
          limit 1
        `
      : await sql<{ id: string }[]>`
          select id from public.forms
          where company_id = ${companyId}
            and slug = ${slug}
            and deleted_at is null
          limit 1
        `
    if (!rows[0]) return slug
    attempt += 1
    slug = `${slugify(baseSlug)}-${attempt}`
  }
}

async function ensureUniqueFieldKey(
  formId: string,
  baseKey: string,
  excludeId?: string | null
) {
  const sql = getSql()
  let key = fieldKeyify(baseKey)
  let attempt = 1
  while (true) {
    const rows = excludeId
      ? await sql<{ id: string }[]>`
          select id from public.form_fields
          where form_id = ${formId}
            and field_key = ${key}
            and deleted_at is null
            and id <> ${excludeId}
          limit 1
        `
      : await sql<{ id: string }[]>`
          select id from public.form_fields
          where form_id = ${formId}
            and field_key = ${key}
            and deleted_at is null
          limit 1
        `
    if (!rows[0]) return key
    attempt += 1
    key = `${fieldKeyify(baseKey)}_${attempt}`
  }
}

async function assertStageBelongsToCompany(companyId: string, stageId: string | null) {
  if (!stageId) return null
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select id from public.crm_stages
    where id = ${stageId}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `
  if (!rows[0]) throw new Error("Coluna do Kanban inválida")
  return rows[0].id
}

async function insertDefaultFields(formId: string, companyId: string, userId: string) {
  const sql = getSql()
  const defaults: {
    fieldType: FormFieldType
    label: string
    fieldKey: string
    mapTo: FormFieldMapTo
    required: boolean
    sortOrder: number
    placeholder: string
  }[] = [
    {
      fieldType: "text",
      label: "Nome completo",
      fieldKey: "nome_completo",
      mapTo: "person_name",
      required: true,
      sortOrder: 10,
      placeholder: "Seu nome",
    },
    {
      fieldType: "phone",
      label: "Telefone",
      fieldKey: "telefone",
      mapTo: "person_phone",
      required: false,
      sortOrder: 20,
      placeholder: "(00) 00000-0000",
    },
    {
      fieldType: "email",
      label: "E-mail",
      fieldKey: "email",
      mapTo: "person_email",
      required: false,
      sortOrder: 30,
      placeholder: "seu@email.com",
    },
    {
      fieldType: "textarea",
      label: "Mensagem",
      fieldKey: "mensagem",
      mapTo: "notes",
      required: false,
      sortOrder: 40,
      placeholder: "Como podemos ajudar?",
    },
  ]

  for (const field of defaults) {
    await sql`
      insert into public.form_fields (
        company_id, form_id, field_type, label, field_key, placeholder, help_text,
        required, options, map_to, sort_order, created_by, updated_by
      )
      values (
        ${companyId}, ${formId}, ${field.fieldType}, ${field.label}, ${field.fieldKey},
        ${field.placeholder}, ${""}, ${field.required}, ${jsonbParam(sql, [])}, ${field.mapTo},
        ${field.sortOrder}, ${userId}, ${userId}
      )
    `
  }
}

export async function saveForm(input: SaveFormInput): Promise<FormsActionResult> {
  try {
    const parsed = saveFormSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)

    if (parsed.id) {
      await requirePermission("forms.edit", companyId)
    } else {
      await requirePermission("forms.create", companyId)
    }

    const targetStageId = await assertStageBelongsToCompany(companyId, parsed.targetStageId)
    const slug = await ensureUniqueFormSlug(
      companyId,
      parsed.slug || parsed.title,
      parsed.id
    )
    const sql = getSql()
    let formId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string; slug: string }[]>`
        update public.forms
        set title = ${parsed.title},
            slug = ${slug},
            description = ${parsed.description},
            status = ${parsed.status},
            target_stage_id = ${targetStageId},
            success_message = ${parsed.successMessage || "Obrigado! Recebemos suas informações."},
            submit_button_label = ${parsed.submitButtonLabel || "Enviar"},
            create_person = ${parsed.createPerson},
            is_active = ${parsed.isActive},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id, slug
      `
      if (!rows[0]) throw new Error("Formulário não encontrado")
      formId = rows[0].id
    } else {
      const rows = await sql<{ id: string; slug: string }[]>`
        insert into public.forms (
          company_id, title, slug, description, status, target_stage_id,
          success_message, submit_button_label, create_person, is_active,
          created_by, updated_by
        )
        values (
          ${companyId}, ${parsed.title}, ${slug}, ${parsed.description}, ${parsed.status},
          ${targetStageId},
          ${parsed.successMessage || "Obrigado! Recebemos suas informações."},
          ${parsed.submitButtonLabel || "Enviar"},
          ${parsed.createPerson}, ${parsed.isActive}, ${user.id}, ${user.id}
        )
        returning id, slug
      `
      formId = rows[0].id
      await insertDefaultFields(formId!, companyId, user.id)
    }

    await writeAuditLog({
      action: "form.save",
      entityTable: "forms",
      entityId: formId,
      companyId,
    })

    const companySlug = await getCompanySlug(companyId)
    await revalidateForms(companySlug, slug)
    if (formId) revalidatePath(`/formularios/${formId}`)
    return { ok: true, id: formId ?? undefined }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteForm(input: {
  id: string
  companyId?: string | null
}): Promise<FormsActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.delete", companyId)
    const sql = getSql()

    const rows = await sql<{ id: string; slug: string }[]>`
      update public.forms
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id, slug
    `
    if (!rows[0]) throw new Error("Formulário não encontrado")

    await sql`
      update public.form_fields
      set deleted_at = now(), updated_by = ${user.id}
      where form_id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
    `

    await writeAuditLog({
      action: "form.delete",
      entityTable: "forms",
      entityId: rows[0].id,
      companyId,
    })

    const companySlug = await getCompanySlug(companyId)
    await revalidateForms(companySlug, rows[0].slug)
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveFormField(input: SaveFormFieldInput): Promise<FormsActionResult> {
  try {
    const parsed = saveFieldSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()

    const formRows = await sql<{ id: string; slug: string }[]>`
      select id, slug from public.forms
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!formRows[0]) throw new Error("Formulário não encontrado")

    const fieldKey = await ensureUniqueFieldKey(
      parsed.formId,
      parsed.fieldKey || parsed.label,
      parsed.id
    )
    const options = parsed.fieldType === "select" ? parsed.options.filter(Boolean) : []

    let fieldId = parsed.id
    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.form_fields
        set field_type = ${parsed.fieldType},
            label = ${parsed.label},
            field_key = ${fieldKey},
            placeholder = ${parsed.placeholder},
            help_text = ${parsed.helpText},
            required = ${parsed.required},
            options = ${jsonbParam(sql, options)},
            map_to = ${parsed.mapTo},
            sort_order = ${parsed.sortOrder},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and form_id = ${parsed.formId}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      if (!rows[0]) throw new Error("Campo não encontrado")
      fieldId = rows[0].id
    } else {
      const maxSort = await sql<{ max: number | null }[]>`
        select max(sort_order) as max from public.form_fields
        where form_id = ${parsed.formId} and deleted_at is null
      `
      const sortOrder = parsed.sortOrder || Number(maxSort[0]?.max ?? 0) + 10
      const rows = await sql<{ id: string }[]>`
        insert into public.form_fields (
          company_id, form_id, field_type, label, field_key, placeholder, help_text,
          required, options, map_to, sort_order, created_by, updated_by
        )
        values (
          ${companyId}, ${parsed.formId}, ${parsed.fieldType}, ${parsed.label}, ${fieldKey},
          ${parsed.placeholder}, ${parsed.helpText}, ${parsed.required}, ${jsonbParam(sql, options)},
          ${parsed.mapTo}, ${sortOrder}, ${user.id}, ${user.id}
        )
        returning id
      `
      fieldId = rows[0].id
    }

    await writeAuditLog({
      action: "form_field.save",
      entityTable: "form_fields",
      entityId: fieldId,
      companyId,
    })

    const companySlug = await getCompanySlug(companyId)
    await revalidateForms(companySlug, formRows[0].slug)
    revalidatePath(`/formularios/${parsed.formId}`)
    return { ok: true, id: fieldId ?? undefined }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteFormField(input: {
  id: string
  companyId?: string | null
}): Promise<FormsActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()

    const rows = await sql<{ id: string; form_id: string }[]>`
      update public.form_fields
      set deleted_at = now(), updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id, form_id
    `
    if (!rows[0]) throw new Error("Campo não encontrado")

    await writeAuditLog({
      action: "form_field.delete",
      entityTable: "form_fields",
      entityId: rows[0].id,
      companyId,
    })

    revalidatePath("/formularios")
    revalidatePath(`/formularios/${rows[0].form_id}`)
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function reorderFormFields(input: {
  formId: string
  companyId?: string | null
  orderedIds: string[]
}): Promise<FormsActionResult> {
  try {
    const parsed = reorderSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()

    const formRows = await sql<{ id: string }[]>`
      select id from public.forms
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!formRows[0]) throw new Error("Formulário não encontrado")

    for (let index = 0; index < parsed.orderedIds.length; index += 1) {
      const fieldId = parsed.orderedIds[index]
      await sql`
        update public.form_fields
        set sort_order = ${(index + 1) * 10}, updated_by = ${user.id}
        where id = ${fieldId}
          and form_id = ${parsed.formId}
          and company_id = ${companyId}
          and deleted_at is null
      `
    }

    revalidatePath(`/formularios/${parsed.formId}`)
    return { ok: true, id: parsed.formId }
  } catch (error) {
    return toErrorResult(error)
  }
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "Visitante", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

export async function submitPublicForm(input: PublicSubmitInput): Promise<FormsActionResult> {
  try {
    const companySlug = z.string().trim().min(1).parse(input.companySlug)
    const formSlug = z.string().trim().min(1).parse(input.formSlug)
    const values = input.values ?? {}
    const sql = getSql()

    const companyRows = await sql<{ id: string; slug: string; name: string }[]>`
      select id, slug, name
      from public.companies
      where slug = ${companySlug}
        and active = true
        and status = 'active'
      limit 1
    `
    const company = companyRows[0]
    if (!company) throw new Error("Igreja não encontrada")

    const formRows = await sql<
      {
        id: string
        title: string
        slug: string
        target_stage_id: string | null
        create_person: boolean
        success_message: string
      }[]
    >`
      select id, title, slug, target_stage_id, create_person, success_message
      from public.forms
      where company_id = ${company.id}
        and slug = ${formSlug}
        and status = 'published'
        and is_active = true
        and deleted_at is null
      limit 1
    `
    const form = formRows[0]
    if (!form) throw new Error("Formulário indisponível")

    const fields = await sql<
      {
        field_key: string
        field_type: FormFieldType
        label: string
        required: boolean
        map_to: FormFieldMapTo
        options: unknown
      }[]
    >`
      select field_key, field_type, label, required, map_to, options
      from public.form_fields
      where form_id = ${form.id}
        and company_id = ${company.id}
        and deleted_at is null
      order by sort_order
    `

    if (fields.length === 0) throw new Error("Formulário sem campos configurados")

    const normalized: Record<string, string | boolean> = {}
    for (const field of fields) {
      const raw = values[field.field_key]
      if (field.field_type === "checkbox") {
        const checked = raw === true || raw === "true" || raw === "on" || raw === "1"
        if (field.required && !checked) {
          throw new Error(`${field.label} é obrigatório`)
        }
        normalized[field.field_key] = checked
        continue
      }

      const textValue = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim()
      if (field.required && !textValue) {
        throw new Error(`${field.label} é obrigatório`)
      }
      if (field.field_type === "email" && textValue) {
        const emailOk = z.string().email().safeParse(textValue)
        if (!emailOk.success) throw new Error(`${field.label} inválido`)
      }
      if (field.field_type === "number" && textValue && Number.isNaN(Number(textValue))) {
        throw new Error(`${field.label} deve ser numérico`)
      }
      if (field.field_type === "select" && textValue) {
        const options = Array.isArray(field.options)
          ? field.options.map(String)
          : []
        if (options.length > 0 && !options.includes(textValue)) {
          throw new Error(`${field.label} inválido`)
        }
      }
      normalized[field.field_key] = textValue
    }

    let personName = ""
    let personEmail = ""
    let personPhone = ""
    const noteParts: string[] = []

    for (const field of fields) {
      const value = normalized[field.field_key]
      const display =
        typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value ?? "")
      if (!display && value !== false) continue

      if (field.map_to === "person_name") personName = String(value)
      else if (field.map_to === "person_email") personEmail = String(value)
      else if (field.map_to === "person_phone") personPhone = String(value)
      else if (field.map_to === "notes") noteParts.push(`${field.label}: ${display}`)
      // Fallback: chave interna comum de telefone sem map_to (evita webhook sem phone)
      else if (
        !personPhone &&
        (field.field_key === "telefone" ||
          field.field_key === "phone" ||
          field.field_key === "celular" ||
          field.field_key === "whatsapp")
      ) {
        personPhone = String(value)
      }
      else if (
        !personName &&
        (field.field_key === "nome" || field.field_key === "name")
      ) {
        personName = String(value)
      }
      else noteParts.push(`${field.label}: ${display}`)
    }

    if (!personName) {
      const firstText = fields.find(
        (field) =>
          field.field_type === "text" &&
          typeof normalized[field.field_key] === "string" &&
          String(normalized[field.field_key]).trim()
      )
      if (firstText) personName = String(normalized[firstText.field_key])
    }
    if (!personName) personName = "Visitante"

    // Normaliza telefone BR para dígitos (Chat valida 10–15 dígitos)
    if (personPhone) {
      const digits = personPhone.replace(/\D/g, "")
      personPhone = digits.length >= 10 ? digits : personPhone
    }

    let personId: string | null = null
    let personWasCreated = false
    let personWasUpdated = false
    if (form.create_person) {
      const { firstName, lastName } = splitName(personName)
      const email = personEmail.trim().toLowerCase() || null

      if (email) {
        const existing = await sql<{ id: string }[]>`
          select id from public.people
          where company_id = ${company.id}
            and deleted_at is null
            and email is not null
            and lower(email) = ${email}
          limit 1
        `
        if (existing[0]) {
          personId = existing[0].id
          await sql`
            update public.people
            set phone = case when ${personPhone} = '' then phone else ${personPhone} end,
                full_name = ${personName},
                first_name = ${firstName},
                last_name = ${lastName},
                updated_at = now()
            where id = ${personId}
          `
          personWasUpdated = true
        }
      }

      if (!personId) {
        const inserted = await sql<{ id: string }[]>`
          insert into public.people (
            company_id, first_name, last_name, full_name, email, phone,
            status, person_type, is_active
          )
          values (
            ${company.id}, ${firstName}, ${lastName}, ${personName}, ${email}, ${personPhone},
            'visitor', 'visitor', true
          )
          returning id
        `
        personId = inserted[0]?.id ?? null
        personWasCreated = Boolean(personId)
      }
    }

    let stageId = form.target_stage_id
    if (stageId) {
      const stageOk = await sql<{ id: string }[]>`
        select id from public.crm_stages
        where id = ${stageId}
          and company_id = ${company.id}
          and deleted_at is null
        limit 1
      `
      if (!stageOk[0]) stageId = null
    }
    if (!stageId) {
      const defaults = await sql<{ id: string }[]>`
        select id from public.crm_stages
        where company_id = ${company.id}
          and deleted_at is null
        order by is_default desc, sort_order
        limit 1
      `
      stageId = defaults[0]?.id ?? null
    }
    if (!stageId) throw new Error("Kanban sem colunas configuradas")

    const notes = noteParts.join("\n")
    const source = `Formulário: ${form.title}`

    const cardRows = await sql<{ id: string }[]>`
      insert into public.crm_cards (
        company_id, person_id, person_name, person_phone, person_email,
        stage_id, source, notes
      )
      values (
        ${company.id}, ${personId}, ${personName}, ${personPhone}, ${personEmail},
        ${stageId}, ${source}, ${notes}
      )
      returning id
    `
    const crmCardId = cardRows[0]?.id
    if (!crmCardId) throw new Error("Não foi possível criar o card no Kanban")

    const submissionRows = await sql<{ id: string }[]>`
      insert into public.form_submissions (
        company_id, form_id, crm_card_id, person_id, payload
      )
      values (
        ${company.id}, ${form.id}, ${crmCardId}, ${personId}, ${jsonbParam(sql, normalized)}
      )
      returning id
    `
    const submissionId = submissionRows[0]?.id

    // Outbound integrations (never fail the public submit)
    try {
      const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
      const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
      const personPayload = {
        id: personId,
        name: personName,
        email: personEmail || null,
        phone: personPhone || null,
      }
      if (personId && personWasCreated) {
        await enqueueIntegrationEventSafe({
          companyId: company.id,
          companySlug: company.slug,
          companyName: company.name,
          eventType: "person.created",
          eventKey: `person.created:${personId}`,
          data: { person: personPayload, source: "form" },
        })
      } else if (personId && personWasUpdated) {
        await enqueueIntegrationEventSafe({
          companyId: company.id,
          companySlug: company.slug,
          companyName: company.name,
          eventType: "person.updated",
          eventKey: `person.updated:${personId}:form:${submissionId ?? "x"}`,
          data: { person: personPayload, source: "form" },
        })
      }
      await enqueueIntegrationEventSafe({
        companyId: company.id,
        companySlug: company.slug,
        companyName: company.name,
        formId: form.id,
        eventType: "crm.card.created",
        eventKey: `crm.card.created:${crmCardId}`,
        data: {
          crmCard: {
            id: crmCardId,
            stageId,
            personName,
            personEmail: personEmail || null,
            personPhone: personPhone || null,
            personId,
            source: `Formulário: ${form.title}`,
          },
        },
      })
      await enqueueIntegrationEventSafe({
        companyId: company.id,
        companySlug: company.slug,
        companyName: company.name,
        formId: form.id,
        eventType: "form.submitted",
        eventKey: `form.submitted:${submissionId ?? crmCardId}`,
        data: {
          submissionId: submissionId ?? null,
          form: { id: form.id, title: form.title, slug: form.slug },
          crmCard: { id: crmCardId, stageId },
          person: personPayload,
          fields: normalized,
          source: `Formulário: ${form.title}`,
        },
      })
      // Despacho imediato (Node) — não depender só do pg_cron/SQL worker
      try {
        await processIntegrationOutbox(25)
      } catch (dispatchError) {
        console.error("[integrations] immediate dispatch failed", dispatchError)
        try {
          const { after } = await import("next/server")
          after(() => {
            void processIntegrationOutbox(25)
          })
        } catch {
          /* cron / worker SQL still picks pending */
        }
      }
    } catch (integrationError) {
      console.error("[integrations] form submit emit failed", integrationError)
    }

    revalidatePath("/crm")
    revalidatePath("/formularios")
    revalidatePath(`/formularios/${form.id}`)
    revalidatePath("/visitantes")
    revalidatePath("/pessoas")

    return { ok: true, id: submissionId }
  } catch (error) {
    return toErrorResult(error)
  }
}
