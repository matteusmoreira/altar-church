"use server"

import { revalidatePath } from "next/cache"
import { afterResponse } from "@/lib/performance/after-response"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { jsonbParam } from "@/lib/db/jsonb"
import { getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { normalizeBrazilianWhatsapp } from "@/lib/auth/phone"
import { enqueueFormWhatsappDelivery, processFormWhatsappOutbox, retryFormWhatsappDelivery } from "./direct-delivery"
import { collectDirectMessageMediaFileIds, directMediaTypeMatches, directMessageSchema, validateTemplateVariables } from "./direct-message"
import {
  deletePreparedAuthUser,
  prepareFormAccount,
} from "./account-provisioning"
import type {
  FormAfterSubmitMode,
  FormDirectMessage,
  FormFieldMapTo,
  FormFieldType,
  FormMediaUploadResult,
  PublicAttributionInput,
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
  createAccountAfterSubmit: z.boolean().optional(),
  isActive: z.boolean().optional().default(true),
})

const formWhatsappSettingsSchema = z.object({
  formId: z.string().uuid(),
  companyId: nullableUuidSchema,
  mode: z.enum(["webhook", "direct_message"] satisfies [FormAfterSubmitMode, FormAfterSubmitMode]),
  instanceId: nullableUuidSchema,
  message: z.unknown().nullable().optional(),
})

const formMediaUploadSchema = z.object({
  formId: z.string().uuid(),
  companyId: nullableUuidSchema,
})

const whatsappMediaMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "application/pdf",
])

const whatsappMediaExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".mp4", ".pdf"])

function whatsappUploadContentType(file: File) {
  if (whatsappMediaMimeTypes.has(file.type)) return file.type
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : ""
  return {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".pdf": "application/pdf",
  }[extension] ?? file.type
}

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

const clearSubmissionsSchema = z.object({
  formId: z.string().uuid(),
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

type AccountFieldDefinition = {
  id?: string
  field_type: FormFieldType
  map_to: FormFieldMapTo
  required: boolean
}

function accountFieldConfigurationError(fields: AccountFieldDefinition[]) {
  const nameFields = fields.filter((field) => field.map_to === "person_name")
  const phoneFields = fields.filter((field) => field.map_to === "person_phone")

  if (nameFields.length !== 1 || !nameFields[0]?.required) {
    return "Para criar conta, mantenha exatamente um campo de nome mapeado e obrigatório."
  }
  if (
    phoneFields.length !== 1 ||
    phoneFields[0]?.field_type !== "phone" ||
    !phoneFields[0]?.required
  ) {
    return "Para criar conta, mantenha exatamente um campo de telefone do tipo telefone, mapeado e obrigatório."
  }
  return null
}

async function assertFormAccountFieldsReady(
  sql: ReturnType<typeof getSql>,
  companyId: string,
  formId: string,
) {
  const fields = await sql<AccountFieldDefinition[]>`
    select id, field_type, map_to, required
    from public.form_fields
    where form_id = ${formId}
      and company_id = ${companyId}
      and deleted_at is null
    order by sort_order, created_at
  `
  const error = accountFieldConfigurationError(fields)
  if (error) throw new Error(error)
}

async function assertFieldSaveKeepsAccountReady(
  sql: ReturnType<typeof getSql>,
  companyId: string,
  formId: string,
  fieldId: string | null,
  nextField: AccountFieldDefinition,
) {
  const formRows = await sql<{ create_account_after_submit: boolean }[]>`
    select create_account_after_submit
    from public.forms
    where id = ${formId}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `
  if (!formRows[0]) throw new Error("Formulário não encontrado")
  if (!formRows[0].create_account_after_submit) return

  const fields = await sql<AccountFieldDefinition[]>`
    select id, field_type, map_to, required
    from public.form_fields
    where form_id = ${formId}
      and company_id = ${companyId}
      and deleted_at is null
    order by sort_order, created_at
  `
  const prospective = fields.filter((field) => field.id !== fieldId)
  prospective.push(nextField)
  const error = accountFieldConfigurationError(prospective)
  if (error) throw new Error(error)
}

async function assertFieldDeleteKeepsAccountReady(
  sql: ReturnType<typeof getSql>,
  companyId: string,
  fieldId: string,
) {
  const formRows = await sql<{ form_id: string; create_account_after_submit: boolean }[]>`
    select form_id, create_account_after_submit
    from public.form_fields ff
    join public.forms f on f.id = ff.form_id
    where ff.id = ${fieldId}
      and ff.company_id = ${companyId}
      and ff.deleted_at is null
      and f.company_id = ${companyId}
      and f.deleted_at is null
    limit 1
  `
  const form = formRows[0]
  if (!form) throw new Error("Campo não encontrado")
  if (!form.create_account_after_submit) return

  const fields = await sql<AccountFieldDefinition[]>`
    select id, field_type, map_to, required
    from public.form_fields
    where form_id = ${form.form_id}
      and company_id = ${companyId}
      and deleted_at is null
      and id <> ${fieldId}
    order by sort_order, created_at
  `
  const error = accountFieldConfigurationError(fields)
  if (error) throw new Error(error)
}

async function insertDefaultFields(
  formId: string,
  companyId: string,
  userId: string,
  accountAfterSubmit = false,
) {
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
      fieldKey: "nome",
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
      required: accountAfterSubmit,
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
    let createAccountAfterSubmit = parsed.createAccountAfterSubmit ?? false

    if (parsed.id) {
      const currentRows = await sql<{
        id: string
        slug: string
        create_account_after_submit: boolean
      }[]>`
        select id, slug, create_account_after_submit
        from public.forms
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        limit 1
      `
      const currentForm = currentRows[0]
      if (!currentForm) throw new Error("Formulário não encontrado")
      createAccountAfterSubmit =
        parsed.createAccountAfterSubmit ?? currentForm.create_account_after_submit
      if (createAccountAfterSubmit) {
        await assertFormAccountFieldsReady(sql, companyId, parsed.id)
      }

      const rows = await sql<{ id: string; slug: string }[]>`
        update public.forms
        set title = ${parsed.title},
            slug = ${slug},
            description = ${parsed.description},
            status = ${parsed.status},
            target_stage_id = ${targetStageId},
            success_message = ${parsed.successMessage || "Obrigado! Recebemos suas informações."},
            submit_button_label = ${parsed.submitButtonLabel || "Enviar"},
            create_person = ${parsed.createPerson || createAccountAfterSubmit},
            create_account_after_submit = ${createAccountAfterSubmit},
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
          success_message, submit_button_label, create_person, create_account_after_submit, is_active,
          created_by, updated_by
        )
        values (
          ${companyId}, ${parsed.title}, ${slug}, ${parsed.description}, ${parsed.status},
          ${targetStageId},
          ${parsed.successMessage || "Obrigado! Recebemos suas informações."},
          ${parsed.submitButtonLabel || "Enviar"},
          ${parsed.createPerson || createAccountAfterSubmit}, ${createAccountAfterSubmit},
          ${parsed.isActive}, ${user.id}, ${user.id}
        )
        returning id, slug
      `
      formId = rows[0].id
      await insertDefaultFields(formId!, companyId, user.id, createAccountAfterSubmit)
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

export async function saveFormWhatsAppSettings(input: {
  formId: string
  companyId?: string | null
  mode: FormAfterSubmitMode
  instanceId?: string | null
  message?: unknown
}): Promise<FormsActionResult> {
  try {
    const parsed = formWhatsappSettingsSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()

    const formRows = await sql<{ id: string; slug: string }[]>`
      select id, slug
      from public.forms
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    const form = formRows[0]
    if (!form) throw new Error("Formulário não encontrado")

    let message: FormDirectMessage | null = null
    if (parsed.mode === "direct_message" && parsed.message != null) {
      const messageResult = directMessageSchema.safeParse(parsed.message)
      if (!messageResult.success) {
        throw new Error(messageResult.error.issues[0]?.message ?? "Mensagem direta inválida")
      }
      message = messageResult.data as FormDirectMessage
    }

    if (parsed.mode === "direct_message") {
      if (!parsed.instanceId) throw new Error("Selecione a instância UAZAPI")
      if (!message) throw new Error("Configure a mensagem direta")

      const instanceRows = await sql<{ id: string }[]>`
        select id
        from public.uazapi_instances
        where id = ${parsed.instanceId}
          and company_id = ${companyId}
          and active = true
        limit 1
      `
      if (!instanceRows[0]) throw new Error("Instância UAZAPI não encontrada ou removida")

      const fieldRows = await sql<{ field_key: string }[]>`
        select field_key
        from public.form_fields
        where form_id = ${parsed.formId}
          and company_id = ${companyId}
          and deleted_at is null
      `
      const allowedKeys = new Set([
        ...fieldRows.map((row) => row.field_key),
        "nome",
        "name",
        "telefone",
        "phone",
        "celular",
        "email",
        "form_title",
        "form_slug",
        "source",
      ])
      validateTemplateVariables(message, allowedKeys)

      const mediaIds = collectDirectMessageMediaFileIds(message)
      if (mediaIds.length > 0) {
        const mediaRows = await sql<{ id: string }[]>`
          select id
          from public.app_files
          where company_id = ${companyId}
            and id = any(${sql.array(mediaIds)}::uuid[])
            and entity_table = 'forms'
            and entity_id = ${parsed.formId}
            and purpose = 'whatsapp-media'
            and is_active = true
            and deleted_at is null
        `
        if (mediaRows.length !== mediaIds.length) throw new Error("Uma ou mais mídias não pertencem a este formulário")
      }
      if (message.type === "carousel") {
        const carouselMediaIds = collectDirectMessageMediaFileIds(message)
        const mediaRows = await sql<{ id: string; mime_type: string }[]>`
          select id, mime_type
          from public.app_files
          where company_id = ${companyId}
            and id = any(${sql.array(carouselMediaIds)}::uuid[])
            and entity_table = 'forms'
            and entity_id = ${parsed.formId}
            and purpose = 'whatsapp-media'
            and is_active = true
            and deleted_at is null
        `
        const mimeById = new Map(mediaRows.map((row) => [row.id, row.mime_type]))
        for (const card of message.cards) {
          if (!card.mediaFileId || !card.mediaType || !directMediaTypeMatches(card.mediaType, mimeById.get(card.mediaFileId) ?? "")) {
            throw new Error("O tipo da mídia do carrossel não corresponde ao arquivo enviado")
          }
        }
      }
    }

    await sql`
      update public.forms
      set after_submit_mode = ${parsed.mode},
          whatsapp_instance_id = ${parsed.mode === "direct_message" ? parsed.instanceId : null},
          whatsapp_message = ${jsonbParam(sql, message ?? {})},
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
    `

    await writeAuditLog({
      action: "form.whatsapp_settings.save",
      entityTable: "forms",
      entityId: parsed.formId,
      companyId,
      metadata: {
        mode: parsed.mode,
        instanceId: parsed.instanceId,
        messageType: message && typeof message === "object" && "type" in message ? message.type : null,
      },
    })

    const companySlug = await getCompanySlug(companyId)
    await revalidateForms(companySlug, form.slug)
    revalidatePath(`/formularios/${parsed.formId}`)
    return { ok: true, id: parsed.formId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function uploadFormWhatsappMedia(formData: FormData): Promise<FormMediaUploadResult> {
  try {
    const parsed = formMediaUploadSchema.parse({
      formId: formData.get("formId"),
      companyId: formData.get("companyId"),
    })
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()
    const formRows = await sql<{ id: string }[]>`
      select id
      from public.forms
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!formRows[0]) throw new Error("Formulário não encontrado")

    const file = getOptionalFile(formData, "file")
    if (!file) throw new Error("Arquivo obrigatório")
    const uploaded = await uploadManagedFile({
      file,
      companyId,
      ownerProfileId: user.id,
      entityTable: "forms",
      entityId: parsed.formId,
      purpose: "whatsapp-media",
      visibility: "private",
      allowedMimeTypes: whatsappMediaMimeTypes,
      allowedExtensions: whatsappMediaExtensions,
      allowGenericMimeByExtension: true,
      contentType: whatsappUploadContentType(file),
      maxSizeBytes: 10 * 1024 * 1024,
      metadata: { formId: parsed.formId, purpose: "form-whatsapp" },
    })
    await writeAuditLog({
      action: "form.whatsapp_media.upload",
      entityTable: "app_files",
      entityId: uploaded.id,
      companyId,
      metadata: {
        formId: parsed.formId,
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      },
    })

    revalidatePath(`/formularios/${parsed.formId}`)
    return {
      ok: true,
      id: uploaded.id,
      originalName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      signedUrl: null,
    }
  } catch (error) {
    const result = toErrorResult(error)
    return { ok: false, error: result.error }
  }
}

export async function retryFormWhatsappDeliveryAction(input: {
  deliveryId: string
  companyId?: string | null
}): Promise<FormsActionResult> {
  try {
    const parsed = z.object({ deliveryId: z.string().uuid(), companyId: nullableUuidSchema }).parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const retry = await retryFormWhatsappDelivery(parsed.deliveryId, companyId)
    if (!retry) throw new Error("Entrega não encontrada ou já processada")
    await writeAuditLog({
      action: "form.whatsapp_delivery.retry",
      entityTable: "form_whatsapp_deliveries",
      entityId: retry.id,
      companyId,
      metadata: { formId: retry.form_id, profileId: user.id },
    })
    revalidatePath(`/formularios/${retry.form_id}`)
    return { ok: true, id: retry.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function clearFormSubmissions(input: {
  formId: string
  companyId?: string | null
}): Promise<FormsActionResult> {
  try {
    const parsed = clearSubmissionsSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("forms.edit", companyId)
    const sql = getSql()

    const formRows = await sql<{ id: string }[]>`
      select id
      from public.forms
      where id = ${parsed.formId}
        and company_id = ${companyId}
        and deleted_at is null
      limit 1
    `
    if (!formRows[0]) throw new Error("Formulário não encontrado")

    const deletedRows = await sql.begin(async (tx) => {
      // Lock the active queue rows before checking them so the worker cannot
      // claim a delivery between the safety check and the cascading delete.
      const activeDeliveryRows = await tx<{ id: string }[]>`
        select id
        from public.form_whatsapp_deliveries
        where form_id = ${parsed.formId}
          and company_id = ${companyId}
          and status in ('pending', 'processing')
        for update
      `
      if (activeDeliveryRows.length > 0) {
        throw new Error(
          `Não é possível limpar enquanto houver ${activeDeliveryRows.length} entrega(s) pendente(s) ou em processamento`,
        )
      }

      return tx<{ id: string }[]>`
        delete from public.form_submissions
        where form_id = ${parsed.formId}
          and company_id = ${companyId}
        returning id
      `
    })

    await writeAuditLog({
      action: "form.submissions.clear",
      entityTable: "form_submissions",
      entityId: parsed.formId,
      companyId,
      metadata: { deletedCount: deletedRows.length, profileId: user.id },
    })
    revalidatePath("/formularios")
    revalidatePath(`/formularios/${parsed.formId}`)
    return { ok: true, id: parsed.formId, data: { deletedCount: deletedRows.length } }
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

    await assertFieldSaveKeepsAccountReady(
      sql,
      companyId,
      parsed.formId,
      parsed.id,
      {
        id: parsed.id ?? undefined,
        field_type: parsed.fieldType,
        map_to: parsed.mapTo,
        required: parsed.required,
      },
    )

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

    await assertFieldDeleteKeepsAccountReady(sql, companyId, parsed.id)

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

const publicSourceKinds = new Set(["qr", "instagram", "site", "referral", "event", "campaign", "direct", "other"])

function bounded(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function normalizePublicAttribution(input?: PublicAttributionInput) {
  const source = bounded(input?.source, 40).toLowerCase()
  return {
    sourceKind: publicSourceKinds.has(source) ? (source || "direct") : "other",
    sourceLabel: bounded(input?.sourceLabel, 120),
    utmSource: bounded(input?.utmSource, 120),
    utmMedium: bounded(input?.utmMedium, 120),
    utmCampaign: bounded(input?.utmCampaign, 160),
    utmContent: bounded(input?.utmContent, 160),
    utmTerm: bounded(input?.utmTerm, 160),
    landingPath: bounded(input?.landingPath, 500),
    referrer: bounded(input?.referrer, 500),
  }
}

type PublicSubmitFormRow = {
  id: string
  title: string
  slug: string
  target_stage_id: string | null
  create_person: boolean
  create_account_after_submit: boolean
  success_message: string
  after_submit_mode: "webhook" | "direct_message"
  whatsapp_instance_id: string | null
  whatsapp_message: unknown
}

type PublicSubmitFieldRow = {
  field_key: string
  field_type: FormFieldType
  label: string
  required: boolean
  map_to: FormFieldMapTo
  options: unknown
}

async function submitPublicFormWithAccount(input: {
  company: { id: string; slug: string; name: string }
  form: PublicSubmitFormRow
  fields: PublicSubmitFieldRow[]
  normalized: Record<string, string | boolean>
  personName: string
  personEmail: string
  personPhone: string
  noteParts: string[]
  attribution?: PublicAttributionInput
}): Promise<FormsActionResult> {
  const sql = getSql()
  const phone = normalizeBrazilianWhatsapp(input.personPhone)
  if (!input.personName.trim()) throw new Error("Nome é obrigatório para criar a conta")
  if (!phone) throw new Error("Informe um WhatsApp móvel válido com DDD")

  const configurationError = accountFieldConfigurationError(input.fields)
  if (configurationError) throw new Error(configurationError)

  const contactEmail = input.personEmail.trim().toLowerCase() || null
  const notes = input.noteParts.join("\n")
  const source = `Formulário: ${input.form.title}`
  const attribution = normalizePublicAttribution(input.attribution)
  let authUserCreatedId: string | null = null

  try {
    const account = await prepareFormAccount({
      companyId: input.company.id,
      name: input.personName,
      phone,
    })
    if (account.authUserCreated) authUserCreatedId = account.authUserId

    const result = await sql.begin(async (tx) => {
      let personId: string | null = null
      let profileId: string | null = null
      let personWasCreated = false
      let personWasUpdated = false
      let accountProfile: {
        id: string
        company_id: string
        auth_user_id: string | null
        person_id: string | null
        email: string
      } | null = null

      if (account.existingProfileId) {
        const profileRows = await tx<{
          id: string
          company_id: string
          auth_user_id: string | null
          person_id: string | null
          email: string
        }[]>`
          select id, company_id, auth_user_id, person_id, email
          from public.profiles
          where id = ${account.existingProfileId}
            and company_id = ${input.company.id}
          for update
        `
        accountProfile = profileRows[0] ?? null
        if (!accountProfile) throw new Error("Conta existente não foi encontrada")
        if (accountProfile.auth_user_id && accountProfile.auth_user_id !== account.authUserId) {
          throw new Error("A conta existente mudou durante o envio; tente novamente")
        }
      }

      let people: { id: string; profile_id: string | null }[] = accountProfile?.person_id
        ? await tx<{ id: string; profile_id: string | null }[]>`
            select id, profile_id
            from public.people
            where id = ${accountProfile.person_id}
              and company_id = ${input.company.id}
              and deleted_at is null
            for update
          `
        : []

      if (people.length === 0 && accountProfile) {
        people = await tx<{ id: string; profile_id: string | null }[]>`
          select id, profile_id
          from public.people
          where company_id = ${input.company.id}
            and profile_id = ${accountProfile.id}
            and deleted_at is null
          limit 1
          for update
        `
      }

      const phonePeople = await tx<{ id: string; profile_id: string | null }[]>`
        select id, profile_id
        from public.people
        where company_id = ${input.company.id}
          and deleted_at is null
          and (
            regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${phone}
            or regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${`55${phone}`}
          )
        order by created_at, id
        for update
      `
      people = [...new Map([...people, ...phonePeople].map((person) => [person.id, person])).values()]

      if (people.length > 1) {
        throw new Error("Há mais de uma Pessoa com este telefone; corrija o cadastro antes de continuar")
      }

      const existingPerson = people[0]
      if (existingPerson?.profile_id && existingPerson.profile_id !== accountProfile?.id) {
        throw new Error("Este telefone já está vinculado a outra conta")
      }

      const { firstName, lastName } = splitName(input.personName)
      if (existingPerson) {
        personId = existingPerson.id
        personWasUpdated = true
        await tx`
          update public.people
          set first_name = ${firstName},
              last_name = ${lastName},
              full_name = ${input.personName},
              email = coalesce(${contactEmail}, email),
              phone = ${phone},
              access_profile = 'member',
              is_active = true,
              updated_at = now()
          where id = ${personId}
            and company_id = ${input.company.id}
            and deleted_at is null
        `
      } else {
        const personRows = await tx<{ id: string }[]>`
          insert into public.people (
            company_id, first_name, last_name, full_name, email, phone,
            access_profile, status, person_type, is_active
          )
          values (
            ${input.company.id}, ${firstName}, ${lastName}, ${input.personName}, ${contactEmail}, ${phone},
            'member', 'visitor', 'visitor', true
          )
          returning id
        `
        personId = personRows[0]?.id ?? null
        personWasCreated = Boolean(personId)
      }

      if (!personId) throw new Error("Pessoa não foi criada para a conta")

      if (accountProfile) {
        profileId = accountProfile.id
        await tx`
          update public.profiles
          set auth_user_id = coalesce(auth_user_id, ${account.authUserId}),
              person_id = ${personId},
              name = ${input.personName},
              email = ${account.authEmail},
              login_phone = ${phone},
              role = 'member',
              active = true,
              updated_at = now()
          where id = ${profileId}
            and company_id = ${input.company.id}
        `
      } else {
        const profileRows = await tx<{ id: string }[]>`
          insert into public.profiles (
            company_id, auth_user_id, person_id, name, email, login_phone, role, active
          )
          values (
            ${input.company.id}, ${account.authUserId}, ${personId}, ${input.personName},
            ${account.authEmail}, ${phone}, 'member', true
          )
          returning id
        `
        profileId = profileRows[0]?.id ?? null
      }

      if (!profileId) throw new Error("Perfil de acesso não foi criado")

      await tx`
        update public.people
        set profile_id = ${profileId},
            access_profile = 'member',
            updated_at = now()
        where id = ${personId}
          and company_id = ${input.company.id}
          and deleted_at is null
      `

      let stageId = input.form.target_stage_id
      if (stageId) {
        const stageRows = await tx<{ id: string }[]>`
          select id
          from public.crm_stages
          where id = ${stageId}
            and company_id = ${input.company.id}
            and deleted_at is null
          limit 1
        `
        if (!stageRows[0]) stageId = null
      }
      if (!stageId) {
        const defaultRows = await tx<{ id: string }[]>`
          select id
          from public.crm_stages
          where company_id = ${input.company.id}
            and deleted_at is null
          order by is_default desc, sort_order
          limit 1
        `
        stageId = defaultRows[0]?.id ?? null
      }
      if (!stageId) throw new Error("Kanban sem colunas configuradas")

      const cardRows = await tx<{ id: string }[]>`
        insert into public.crm_cards (
          company_id, person_id, person_name, person_phone, person_email,
          stage_id, source, notes
        )
        values (
          ${input.company.id}, ${personId}, ${input.personName}, ${phone}, ${input.personEmail},
          ${stageId}, ${source}, ${notes}
        )
        returning id
      `
      const crmCardId = cardRows[0]?.id
      if (!crmCardId) throw new Error("Não foi possível criar o card no Kanban")

      const submissionRows = await tx<{ id: string }[]>`
        insert into public.form_submissions (
          company_id, form_id, crm_card_id, person_id, payload
        )
        values (
          ${input.company.id}, ${input.form.id}, ${crmCardId}, ${personId}, ${tx.json(input.normalized)}
        )
        returning id
      `
      const submissionId = submissionRows[0]?.id
      if (!submissionId) throw new Error("Não foi possível registrar o envio")

      await tx`
        insert into public.public_acquisition_events (
          company_id, event_kind, source_kind, source_label,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          landing_path, referrer, form_id, form_submission_id, person_id, crm_card_id, idempotency_key
        )
        values (
          ${input.company.id}, 'form_submission', ${attribution.sourceKind}, ${attribution.sourceLabel},
          ${attribution.utmSource}, ${attribution.utmMedium}, ${attribution.utmCampaign},
          ${attribution.utmContent}, ${attribution.utmTerm}, ${attribution.landingPath},
          ${attribution.referrer}, ${input.form.id}, ${submissionId}, ${personId}, ${crmCardId},
          ${`form_submission:${submissionId}`}
        )
        on conflict do nothing
      `

      const followUpRows = await tx<{ id: string }[]>`
        insert into public.person_follow_up_tasks (
          company_id, person_id, crm_card_id, title, notes, priority, status, origin, source_key
        )
        values (
          ${input.company.id}, ${personId}, ${crmCardId}, 'Fazer primeiro contato com novo cadastro',
          ${`Origem: ${input.form.title}. Tarefa criada automaticamente após envio público.`},
          'normal', 'open', 'public_form', ${`public_form:${submissionId}`}
        )
        on conflict do nothing
        returning id
      `
      if (followUpRows[0]?.id) {
        await tx`
          insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
          values (
            ${input.company.id}, 'person_follow_up_task.public_form', 'person_follow_up_tasks', ${followUpRows[0].id},
            ${JSON.stringify({ submissionId, personId, formId: input.form.id })}::jsonb
          )
        `
      }

      await tx`
        insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
        values (
          ${input.company.id}, 'form.account_provisioned', 'profiles', ${profileId},
          ${JSON.stringify({
            formId: input.form.id,
            submissionId,
            personId,
            accountReused: Boolean(account.existingProfileId),
            authUserCreated: Boolean(account.authUserCreated),
          })}::jsonb
        )
      `

      const accountWasCreated = !account.existingProfileId
      if (accountWasCreated) {
        await tx`
          update public.companies c
          set user_count = counts.total
          from (
            select company_id, count(*)::integer as total
            from public.profiles
            where company_id is not null and active = true
            group by company_id
          ) counts
          where c.id = counts.company_id
            and c.id = ${input.company.id}
        `
      }

      return {
        personId,
        profileId,
        personWasCreated,
        personWasUpdated,
        accountWasCreated,
        stageId,
        crmCardId,
        submissionId,
      }
    })

    authUserCreatedId = null

    const templateFields: Record<string, unknown> = {
      ...input.normalized,
      form_title: input.form.title,
      form_slug: input.form.slug,
      source,
    }
    templateFields.nome = input.personName
    templateFields.name = input.personName
    templateFields.telefone = phone
    templateFields.phone = phone
    if (templateFields.celular == null || templateFields.celular === "") {
      templateFields.celular = phone
    }
    if (input.personEmail) templateFields.email = input.personEmail

    if (input.form.after_submit_mode === "direct_message") {
      try {
        await enqueueFormWhatsappDelivery({
          companyId: input.company.id,
          formId: input.form.id,
          submissionId: result.submissionId,
          personId: result.personId,
          instanceId: input.form.whatsapp_instance_id,
          recipient: phone,
          recipientName: input.personName,
          message: input.form.whatsapp_message,
          templateFields,
        })
        afterResponse("form whatsapp outbox", async () => {
          await processFormWhatsappOutbox(25)
        })
      } catch (directError) {
        console.error("[form-whatsapp] enqueue failed", directError)
      }
    } else {
      try {
        const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
        const personPayload = {
          id: result.personId,
          name: input.personName,
          email: input.personEmail || null,
          phone,
        }
        if (result.personWasCreated) {
          await enqueueIntegrationEventSafe({
            companyId: input.company.id,
            companySlug: input.company.slug,
            companyName: input.company.name,
            eventType: "person.created",
            eventKey: `person.created:${result.personId}`,
            data: { person: personPayload, source: "form" },
          })
        } else if (result.personWasUpdated) {
          await enqueueIntegrationEventSafe({
            companyId: input.company.id,
            companySlug: input.company.slug,
            companyName: input.company.name,
            eventType: "person.updated",
            eventKey: `person.updated:${result.personId}:form:${result.submissionId}`,
            data: { person: personPayload, source: "form" },
          })
        }
        await enqueueIntegrationEventSafe({
          companyId: input.company.id,
          companySlug: input.company.slug,
          companyName: input.company.name,
          formId: input.form.id,
          eventType: "crm.card.created",
          eventKey: `crm.card.created:${result.crmCardId}`,
          data: {
            crmCard: {
              id: result.crmCardId,
              stageId: result.stageId,
              personName: input.personName,
              personEmail: input.personEmail || null,
              personPhone: phone,
              personId: result.personId,
              source,
            },
          },
        })
        await enqueueIntegrationEventSafe({
          companyId: input.company.id,
          companySlug: input.company.slug,
          companyName: input.company.name,
          formId: input.form.id,
          eventType: "form.submitted",
          eventKey: `form.submitted:${result.submissionId}`,
          data: {
            submissionId: result.submissionId,
            form: { id: input.form.id, title: input.form.title, slug: input.form.slug },
            crmCard: { id: result.crmCardId, stageId: result.stageId },
            person: personPayload,
            fields: templateFields,
            source,
          },
        })
        afterResponse("integration outbox", async () => {
          const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
          await processIntegrationOutbox(25)
        })
      } catch (integrationError) {
        console.error("[integrations] form submit emit failed", integrationError)
      }
    }

    revalidatePath("/crm")
    revalidatePath("/formularios")
    revalidatePath(`/formularios/${input.form.id}`)
    revalidatePath("/visitantes")
    revalidatePath("/pessoas")

    return { ok: true, id: result.submissionId }
  } catch (error) {
    if (authUserCreatedId) {
      try {
        await deletePreparedAuthUser(authUserCreatedId)
      } catch (cleanupError) {
        console.error("[form-account] auth cleanup failed", cleanupError)
      }
    }
    throw error
  }
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
        create_account_after_submit: boolean
        success_message: string
        after_submit_mode: "webhook" | "direct_message"
        whatsapp_instance_id: string | null
        whatsapp_message: unknown
      }[]
    >`
      select id, title, slug, target_stage_id, create_person, create_account_after_submit, success_message,
             after_submit_mode, whatsapp_instance_id, whatsapp_message
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
      // Fallback: chaves comuns de nome (inclui nome_completo do form padrão)
      else if (
        !personName &&
        (field.field_key === "nome" ||
          field.field_key === "name" ||
          field.field_key === "nome_completo" ||
          field.field_key === "full_name" ||
          field.field_key.includes("nome"))
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

    if (form.create_account_after_submit) {
      return await submitPublicFormWithAccount({
        company,
        form,
        fields,
        normalized,
        personName,
        personEmail,
        personPhone,
        noteParts,
        attribution: input.attribution,
      })
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

    const attribution = normalizePublicAttribution(input.attribution)
    if (submissionId) {
      await sql`
        insert into public.public_acquisition_events (
          company_id, event_kind, source_kind, source_label,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term,
          landing_path, referrer, form_id, form_submission_id, person_id, crm_card_id, idempotency_key
        )
        values (
          ${company.id}, 'form_submission', ${attribution.sourceKind}, ${attribution.sourceLabel},
          ${attribution.utmSource}, ${attribution.utmMedium}, ${attribution.utmCampaign},
          ${attribution.utmContent}, ${attribution.utmTerm}, ${attribution.landingPath},
          ${attribution.referrer}, ${form.id}, ${submissionId}, ${personId}, ${crmCardId},
          ${`form_submission:${submissionId}`}
        )
        on conflict do nothing
      `
    }

    if (personId && submissionId) {
      const followUpRows = await sql<{ id: string }[]>`
        insert into public.person_follow_up_tasks (
          company_id, person_id, crm_card_id, title, notes, priority, status, origin, source_key
        )
        values (
          ${company.id}, ${personId}, ${crmCardId}, 'Fazer primeiro contato com novo cadastro',
          ${`Origem: ${form.title}. Tarefa criada automaticamente após envio público.`},
          'normal', 'open', 'public_form', ${`public_form:${submissionId}`}
        )
        on conflict do nothing
        returning id
      `
      if (followUpRows[0]?.id) {
        await sql`
          insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
          values (
            ${company.id}, 'person_follow_up_task.public_form', 'person_follow_up_tasks', ${followUpRows[0].id},
            ${JSON.stringify({ submissionId, personId, formId: form.id })}::jsonb
          )
        `
      }
    }

    const templateFields: Record<string, unknown> = {
      ...normalized,
      form_title: form.title,
      form_slug: form.slug,
      source,
    }
    if (personName) {
      templateFields.nome = personName
      templateFields.name = personName
    }
    if (personPhone) {
      templateFields.telefone = personPhone
      templateFields.phone = personPhone
      if (templateFields.celular == null || templateFields.celular === "") {
        templateFields.celular = personPhone
      }
    }
    if (personEmail) templateFields.email = personEmail

    if (form.after_submit_mode === "direct_message") {
      try {
        if (submissionId) {
          const directRecipient = personPhone.replace(/\D/g, "")
          await enqueueFormWhatsappDelivery({
            companyId: company.id,
            formId: form.id,
            submissionId,
            personId,
            instanceId: form.whatsapp_instance_id,
            recipient: directRecipient.length >= 10 ? directRecipient : "",
            recipientName: personName,
            message: form.whatsapp_message,
            templateFields,
          })
          afterResponse("form whatsapp outbox", async () => {
            await processFormWhatsappOutbox(25)
          })
        }
      } catch (directError) {
        console.error("[form-whatsapp] enqueue failed", directError)
      }
    } else {
      // Outbound integrations (never fail the public submit)
      try {
      const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
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
      // Aliases canônicos para automações ({{nome}}, {{telefone}}, {{email}}).
      // Cada field_key do form vira {{field_key}}; estes aliases cobrem map_to de pessoa.
      const templateFields: Record<string, unknown> = { ...normalized }
      if (personName) {
        templateFields.nome = personName
        templateFields.name = personName
      }
      if (personPhone) {
        templateFields.telefone = personPhone
        templateFields.phone = personPhone
        if (templateFields.celular == null || templateFields.celular === "") {
          templateFields.celular = personPhone
        }
      }
      if (personEmail) {
        templateFields.email = personEmail
      }

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
          fields: templateFields,
          source: `Formulário: ${form.title}`,
        },
      })
      afterResponse("integration outbox", async () => {
        const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
        await processIntegrationOutbox(25)
      })
    } catch (integrationError) {
      console.error("[integrations] form submit emit failed", integrationError)
    }
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
