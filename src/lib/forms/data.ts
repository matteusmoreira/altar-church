import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import type {
  ChurchForm,
  FormBuilderData,
  FormField,
  FormFieldMapTo,
  FormFieldType,
  FormStatus,
  FormSubmission,
  FormsDashboardData,
  PublicFormData,
} from "./types"

interface FormRow {
  id: string
  company_id: string
  title: string
  slug: string
  description: string
  status: FormStatus
  target_stage_id: string | null
  target_stage_name: string | null
  success_message: string
  submit_button_label: string
  create_person: boolean
  is_active: boolean
  field_count?: number | string | null
  submission_count?: number | string | null
  created_at: Date | string
  updated_at: Date | string
}

interface FieldRow {
  id: string
  company_id: string
  form_id: string
  field_type: FormFieldType
  label: string
  field_key: string
  placeholder: string
  help_text: string
  required: boolean
  options: unknown
  map_to: FormFieldMapTo
  sort_order: number
}

interface SubmissionRow {
  id: string
  form_id: string
  company_id: string
  crm_card_id: string | null
  person_id: string | null
  payload: unknown
  created_at: Date | string
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return ""
  return value instanceof Date ? value.toISOString() : String(value)
}

function parseOptions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean)
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : []
    } catch {
      return []
    }
  }
  return []
}

function toForm(row: FormRow, companySlug?: string): ChurchForm {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status,
    targetStageId: row.target_stage_id,
    targetStageName: row.target_stage_name,
    successMessage: row.success_message,
    submitButtonLabel: row.submit_button_label,
    createPerson: row.create_person,
    isActive: row.is_active,
    fieldCount: row.field_count == null ? undefined : Number(row.field_count),
    submissionCount: row.submission_count == null ? undefined : Number(row.submission_count),
    publicUrl: companySlug ? `/f/${companySlug}/${row.slug}` : undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toField(row: FieldRow): FormField {
  return {
    id: row.id,
    formId: row.form_id,
    companyId: row.company_id,
    fieldType: row.field_type,
    label: row.label,
    fieldKey: row.field_key,
    placeholder: row.placeholder,
    helpText: row.help_text,
    required: row.required,
    options: parseOptions(row.options),
    mapTo: row.map_to,
    sortOrder: row.sort_order,
  }
}

function toSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: row.id,
    formId: row.form_id,
    companyId: row.company_id,
    crmCardId: row.crm_card_id,
    personId: row.person_id,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: toIso(row.created_at),
  }
}

async function resolveCompanyId(companyIdInput?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  return requireUserCompanyId(user, companyIdInput)
}

async function getCompanySlug(companyId: string) {
  const sql = getSql()
  const rows = await sql<{ slug: string }[]>`
    select slug from public.companies where id = ${companyId} limit 1
  `
  return rows[0]?.slug ?? ""
}

export async function getFormsDashboardData(companyIdInput?: string | null): Promise<FormsDashboardData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("forms.view", companyId)
  const sql = getSql()
  const companySlug = await getCompanySlug(companyId)

  const [formRows, stageRows] = await Promise.all([
    sql<FormRow[]>`
      select
        f.id,
        f.company_id,
        f.title,
        f.slug,
        f.description,
        f.status,
        f.target_stage_id,
        s.name as target_stage_name,
        f.success_message,
        f.submit_button_label,
        f.create_person,
        f.is_active,
        f.created_at,
        f.updated_at,
        (
          select count(*)::int from public.form_fields ff
          where ff.form_id = f.id and ff.deleted_at is null
        ) as field_count,
        (
          select count(*)::int from public.form_submissions fs
          where fs.form_id = f.id
        ) as submission_count
      from public.forms f
      left join public.crm_stages s on s.id = f.target_stage_id and s.deleted_at is null
      where f.company_id = ${companyId}
        and f.deleted_at is null
      order by f.updated_at desc
      limit 200
    `,
    sql<{ id: string; name: string; color: string }[]>`
      select id, name, color
      from public.crm_stages
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order, created_at
    `,
  ])

  return {
    companyId,
    companySlug,
    forms: formRows.map((row) => toForm(row, companySlug)),
    stages: stageRows,
  }
}

export async function getFormBuilderData(
  formId: string,
  companyIdInput?: string | null
): Promise<FormBuilderData | null> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("forms.view", companyId)
  const sql = getSql()
  const companySlug = await getCompanySlug(companyId)

  const formRows = await sql<FormRow[]>`
    select
      f.id,
      f.company_id,
      f.title,
      f.slug,
      f.description,
      f.status,
      f.target_stage_id,
      s.name as target_stage_name,
      f.success_message,
      f.submit_button_label,
      f.create_person,
      f.is_active,
      f.created_at,
      f.updated_at
    from public.forms f
    left join public.crm_stages s on s.id = f.target_stage_id and s.deleted_at is null
    where f.id = ${formId}
      and f.company_id = ${companyId}
      and f.deleted_at is null
    limit 1
  `

  const formRow = formRows[0]
  if (!formRow) return null

  const [fieldRows, stageRows, submissionRows] = await Promise.all([
    sql<FieldRow[]>`
      select *
      from public.form_fields
      where form_id = ${formId}
        and company_id = ${companyId}
        and deleted_at is null
      order by sort_order, created_at
    `,
    sql<{ id: string; name: string; color: string }[]>`
      select id, name, color
      from public.crm_stages
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order, created_at
    `,
    sql<SubmissionRow[]>`
      select *
      from public.form_submissions
      where form_id = ${formId}
        and company_id = ${companyId}
      order by created_at desc
      limit 20
    `,
  ])

  return {
    companyId,
    companySlug,
    form: toForm(formRow, companySlug),
    fields: fieldRows.map(toField),
    stages: stageRows,
    recentSubmissions: submissionRows.map(toSubmission),
  }
}

/** List forms for REST / API key clients (permission-gated). */
export async function listFormsForApi(companyIdInput?: string | null) {
  const data = await getFormsDashboardData(companyIdInput)
  return data.forms
}

export async function getFormForApi(formId: string, companyIdInput?: string | null) {
  return getFormBuilderData(formId, companyIdInput)
}

export async function listFormSubmissions(
  formId: string,
  companyIdInput?: string | null,
  options?: { page?: number; pageSize?: number },
) {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("forms.view", companyId)
  const page = Math.max(options?.page ?? 1, 1)
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 100)
  const offset = (page - 1) * pageSize
  const sql = getSql()

  const formOk = await sql<{ id: string }[]>`
    select id from public.forms
    where id = ${formId}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `
  if (!formOk[0]) return null

  const [countRows, rows] = await Promise.all([
    sql<{ total: number }[]>`
      select count(*)::int as total
      from public.form_submissions
      where form_id = ${formId}
        and company_id = ${companyId}
    `,
    sql<SubmissionRow[]>`
      select *
      from public.form_submissions
      where form_id = ${formId}
        and company_id = ${companyId}
      order by created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
  ])

  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(toSubmission),
    meta: {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

export async function getFormSubmissionById(
  submissionId: string,
  companyIdInput?: string | null,
) {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("forms.view", companyId)
  const sql = getSql()
  const rows = await sql<SubmissionRow[]>`
    select *
    from public.form_submissions
    where id = ${submissionId}
      and company_id = ${companyId}
    limit 1
  `
  return rows[0] ? toSubmission(rows[0]) : null
}

/**
 * API-key path: company already resolved, skip session permission (caller enforced scopes).
 */
export async function listFormSubmissionsForCompany(
  companyId: string,
  formId: string,
  options?: { page?: number; pageSize?: number },
) {
  const page = Math.max(options?.page ?? 1, 1)
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 1), 100)
  const offset = (page - 1) * pageSize
  const sql = getSql()

  const formOk = await sql<{ id: string }[]>`
    select id from public.forms
    where id = ${formId}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `
  if (!formOk[0]) return null

  const [countRows, rows] = await Promise.all([
    sql<{ total: number }[]>`
      select count(*)::int as total
      from public.form_submissions
      where form_id = ${formId}
        and company_id = ${companyId}
    `,
    sql<SubmissionRow[]>`
      select *
      from public.form_submissions
      where form_id = ${formId}
        and company_id = ${companyId}
      order by created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
  ])

  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(toSubmission),
    meta: {
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  }
}

export async function listFormsForCompany(companyId: string) {
  const sql = getSql()
  const companySlug = await getCompanySlug(companyId)
  const formRows = await sql<FormRow[]>`
    select
      f.id, f.company_id, f.title, f.slug, f.description, f.status,
      f.target_stage_id, s.name as target_stage_name,
      f.success_message, f.submit_button_label, f.create_person, f.is_active,
      f.created_at, f.updated_at,
      (select count(*)::int from public.form_fields ff where ff.form_id = f.id and ff.deleted_at is null) as field_count,
      (select count(*)::int from public.form_submissions fs where fs.form_id = f.id) as submission_count
    from public.forms f
    left join public.crm_stages s on s.id = f.target_stage_id and s.deleted_at is null
    where f.company_id = ${companyId}
      and f.deleted_at is null
    order by f.updated_at desc
    limit 200
  `
  return formRows.map((row) => toForm(row, companySlug))
}

export async function getFormSubmissionForCompany(companyId: string, submissionId: string) {
  const sql = getSql()
  const rows = await sql<SubmissionRow[]>`
    select *
    from public.form_submissions
    where id = ${submissionId}
      and company_id = ${companyId}
    limit 1
  `
  return rows[0] ? toSubmission(rows[0]) : null
}

export async function getPublicFormData(
  companySlug: string,
  formSlug: string
): Promise<PublicFormData | null> {
  const sql = getSql()
  const companyRows = await sql<
    {
      id: string
      slug: string
      name: string
      public_name: string | null
      logo_storage_path: string | null
    }[]
  >`
    select
      c.id,
      c.slug,
      c.name,
      cp.public_name,
      logo.storage_path as logo_storage_path
    from public.companies c
    left join public.church_profiles cp on cp.company_id = c.id
    left join public.app_files logo
      on logo.id = cp.logo_file_id
      and logo.is_active = true
      and logo.deleted_at is null
    where c.slug = ${companySlug}
      and c.active = true
      and c.status = 'active'
    limit 1
  `

  const company = companyRows[0]
  if (!company) return null

  const formRows = await sql<FormRow[]>`
    select
      f.id,
      f.company_id,
      f.title,
      f.slug,
      f.description,
      f.status,
      f.target_stage_id,
      null::text as target_stage_name,
      f.success_message,
      f.submit_button_label,
      f.create_person,
      f.is_active,
      f.created_at,
      f.updated_at
    from public.forms f
    where f.company_id = ${company.id}
      and f.slug = ${formSlug}
      and f.status = 'published'
      and f.is_active = true
      and f.deleted_at is null
    limit 1
  `

  const form = formRows[0]
  if (!form) return null

  const fieldRows = await sql<FieldRow[]>`
    select *
    from public.form_fields
    where form_id = ${form.id}
      and company_id = ${company.id}
      and deleted_at is null
    order by sort_order, created_at
  `

  const logoUrls = await createSignedUrlsByStoragePath(
    company.logo_storage_path ? [company.logo_storage_path] : []
  )
  const logoUrl = company.logo_storage_path
    ? logoUrls.get(company.logo_storage_path) || null
    : null

  return {
    companyId: company.id,
    companySlug: company.slug,
    companyName: company.name,
    publicName: company.public_name || company.name,
    logoUrl,
    form: toForm(form, company.slug),
    fields: fieldRows.map(toField),
  }
}
