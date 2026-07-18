"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { parseJsonbObject } from "@/lib/db/jsonb"
import { createSignedUrlsByStoragePath, deleteManagedFile, getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { assertKidsLeaderScope } from "./access"
import { createDefaultLabelDesign, kidLabelDesignSchema, kidLabelDraftSchema, kidLabelScopeSchema, labelContainsSensitiveFields, validatePublishableLabel } from "./label-design"
import { buildAttendancePrintableLabels } from "./label-printing-server"
import type { KidLabelKind, KidLabelRenderContext, KidLabelRevision, KidLabelTemplate, KidsActionResult } from "./types"

type LabelResult = KidsActionResult & { templates?: KidLabelTemplate[]; revision?: KidLabelRevision; file?: { id: string; url: string }; previewContext?: KidLabelRenderContext; previewLabel?: string }
type DateValue = Date | string | null

function iso(value: DateValue) { return value instanceof Date ? value.toISOString() : value ? String(value) : null }
function failure(error: unknown): LabelResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

async function context(permission: "kids.settings.manage" | "kids.health.view" | "kids.checkin.create" = "kids.settings.manage") {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user)
  await assertKidsLeaderScope(user, companyId)
  await requirePermission(permission, companyId)
  return { user, companyId }
}

interface RevisionRow {
  id: string; template_id: string; version: number; status: KidLabelRevision["status"]; schema_version: number
  width_mm: string | number; height_mm: string | number; dpi: 203 | 300 | 600; design: unknown
  contains_sensitive_fields: boolean; published_at: DateValue; created_at: DateValue
}
interface TemplateRow {
  id: string; congregation_id: string | null; kind: KidLabelKind; name: string; is_active: boolean
  draft_revision_id: string | null; published_revision_id: string | null; revisions: unknown
}

function toRevision(row: RevisionRow): KidLabelRevision {
  return { id: row.id, templateId: row.template_id, version: row.version, status: row.status, schemaVersion: row.schema_version,
    widthMm: Number(row.width_mm), heightMm: Number(row.height_mm), dpi: row.dpi,
    design: kidLabelDesignSchema.parse(parseJsonbObject(row.design)), containsSensitiveFields: row.contains_sensitive_fields,
    publishedAt: iso(row.published_at), createdAt: iso(row.created_at) ?? "" }
}

async function hydrateAssets(companyId: string, templates: KidLabelTemplate[]) {
  const ids = [...new Set(templates.flatMap((template) => template.revisions.flatMap((revision) => [revision.design.backgroundAssetId, ...revision.design.elements.map((item) => item.assetId)]).filter(Boolean) as string[]))]
  if (!ids.length) return templates
  const rows = await getSql()<{ id: string; storage_path: string }[]>`
    select id, storage_path from public.app_files where company_id = ${companyId} and id = any(${ids}) and is_active = true and deleted_at is null
  `
  const urls = await createSignedUrlsByStoragePath(rows.map((row) => row.storage_path), 3600)
  const byId = new Map(rows.map((row) => [row.id, urls.get(row.storage_path) ?? ""]))
  for (const template of templates) for (const revision of template.revisions) {
    revision.design.backgroundAssetUrl = revision.design.backgroundAssetId ? byId.get(revision.design.backgroundAssetId) ?? null : null
    revision.design.elements = revision.design.elements.map((item) => ({ ...item, assetUrl: item.assetId ? byId.get(item.assetId) ?? null : item.assetUrl }))
  }
  return templates
}

async function ensureDefaultTemplate(companyId: string, userId: string, congregationId: string | null, kind: KidLabelKind) {
  const sql = getSql()
  const current = await sql<{ id: string }[]>`
    select id from public.kid_label_templates where company_id = ${companyId} and congregation_id is not distinct from ${congregationId}
      and kind = ${kind} and deleted_at is null order by is_active desc, created_at limit 1
  `
  if (current[0]) return current[0].id
  return sql.begin(async (tx) => {
    const template = await tx<{ id: string }[]>`
      insert into public.kid_label_templates (company_id, congregation_id, kind, name, is_active, created_by, updated_by)
      values (${companyId}, ${congregationId}, ${kind}, ${kind === "child" ? "Etiqueta da criança" : "Etiqueta do responsável"}, true, ${userId}, ${userId})
      returning id
    `
    const templateId = template[0].id
    const design = createDefaultLabelDesign(kind)
    const revision = await tx<{ id: string }[]>`
      insert into public.kid_label_template_revisions (company_id, template_id, version, status, width_mm, height_mm, dpi, design, created_by, published_by, published_at)
      values (${companyId}, ${templateId}, 1, 'published', 62, 40, 203, ${tx.json(JSON.parse(JSON.stringify(design)))}, ${userId}, ${userId}, now()) returning id
    `
    await tx`update public.kid_label_templates set draft_revision_id = ${revision[0].id}, published_revision_id = ${revision[0].id} where id = ${templateId}`
    return templateId
  })
}

export async function loadKidLabelTemplates(input: unknown = {}): Promise<LabelResult> {
  try {
    const parsed = kidLabelScopeSchema.parse(input)
    const { user, companyId } = await context()
    await Promise.all((["child", "guardian"] as KidLabelKind[]).map((kind) => ensureDefaultTemplate(companyId, user.id, parsed.congregationId, kind)))
    const rows = await getSql()<TemplateRow[]>`
      select template.id, template.congregation_id, template.kind, template.name, template.is_active,
             template.draft_revision_id, template.published_revision_id,
             coalesce(jsonb_agg(to_jsonb(revision) order by revision.version desc) filter (where revision.id is not null), '[]'::jsonb) as revisions
      from public.kid_label_templates template
      left join public.kid_label_template_revisions revision on revision.template_id = template.id
      where template.company_id = ${companyId} and template.congregation_id is not distinct from ${parsed.congregationId} and template.deleted_at is null
      group by template.id order by template.kind, template.created_at
    `
    const templates: KidLabelTemplate[] = rows.map((row) => ({
      id: row.id, congregationId: row.congregation_id, kind: row.kind, name: row.name, isActive: row.is_active,
      draftRevisionId: row.draft_revision_id, publishedRevisionId: row.published_revision_id,
      revisions: Array.isArray(row.revisions) ? row.revisions.map((revision) => toRevision(revision as RevisionRow)) : [],
    }))
    return { ok: true, templates: await hydrateAssets(companyId, templates) }
  } catch (error) { return failure(error) }
}

export async function loadKidLabelRealPreview(input: unknown): Promise<LabelResult> {
  try {
    const parsed = z.object({ kidId: z.string().uuid(), includeSensitive: z.boolean().default(false) }).parse(input)
    const { companyId } = await context()
    if (parsed.includeSensitive) await requirePermission("kids.health.view", companyId)
    const rows = await getSql()<{ id: string; child_full_name: string }[]>`
      select attendance.id, person.full_name as child_full_name
      from public.kid_attendances attendance
      join public.kid_profiles kid on kid.id = attendance.kid_id
      join public.people person on person.id = kid.person_id
      where attendance.company_id = ${companyId} and attendance.kid_id = ${parsed.kidId}
      order by attendance.checked_in_at desc limit 1
    `
    if (!rows[0]) return { ok: false, error: "A criança ainda não possui presença para usar no preview" }
    const labels = await buildAttendancePrintableLabels({ companyId, attendanceId: rows[0].id, pickupPin: "123456", pickupToken: `preview:${crypto.randomUUID()}` })
    const previewContext = { ...labels[0].context }
    if (!parsed.includeSensitive) {
      previewContext.allergies = ""
      previewContext.dietaryRestrictions = ""
      previewContext.medication = ""
      previewContext.specialNeeds = ""
      previewContext.healthInstructions = ""
    }
    return { ok: true, previewContext, previewLabel: `${rows[0].child_full_name} · última presença` }
  } catch (error) { return failure(error) }
}

export async function saveKidLabelDraft(input: unknown): Promise<LabelResult> {
  try {
    const parsed = kidLabelDraftSchema.parse(input)
    const storedDesign = { ...parsed.design, backgroundAssetUrl: undefined, elements: parsed.design.elements.map((item) => ({ ...item, assetUrl: undefined })) }
    const { user, companyId } = await context()
    const sql = getSql()
    const template = await sql<{ id: string }[]>`select id from public.kid_label_templates where id = ${parsed.templateId} and company_id = ${companyId} and deleted_at is null`
    if (!template[0]) throw new Error("Modelo não encontrado")
    const revision = await sql.begin(async (tx) => {
      const versions = await tx<{ version: number }[]>`select coalesce(max(version), 0)::int as version from public.kid_label_template_revisions where template_id = ${parsed.templateId}`
      const rows = await tx<RevisionRow[]>`
        insert into public.kid_label_template_revisions (company_id, template_id, version, status, width_mm, height_mm, dpi, design, contains_sensitive_fields, created_by)
        values (${companyId}, ${parsed.templateId}, ${(versions[0]?.version ?? 0) + 1}, 'draft', ${parsed.widthMm}, ${parsed.heightMm}, ${parsed.dpi},
          ${tx.json(JSON.parse(JSON.stringify(storedDesign)))}, ${labelContainsSensitiveFields(storedDesign)}, ${user.id}) returning *
      `
      await tx`update public.kid_label_templates set name = ${parsed.name}, draft_revision_id = ${rows[0].id}, updated_by = ${user.id} where id = ${parsed.templateId}`
      return rows[0]
    })
    await writeAuditLog({ action: "kids.label.draft_saved", entityTable: "kid_label_templates", entityId: parsed.templateId, companyId, metadata: { revisionId: revision.id } })
    revalidatePath("/kids")
    return { ok: true, revision: toRevision(revision) }
  } catch (error) { return failure(error) }
}

export async function publishKidLabelRevision(input: unknown): Promise<LabelResult> {
  try {
    const parsed = z.object({ templateId: z.string().uuid(), revisionId: z.string().uuid(), sensitiveConfirmed: z.boolean().default(false) }).parse(input)
    const { user, companyId } = await context()
    const sql = getSql()
    const rows = await sql<(RevisionRow & { kind: KidLabelKind; congregation_id: string | null })[]>`
      select revision.*, template.kind, template.congregation_id from public.kid_label_template_revisions revision
      join public.kid_label_templates template on template.id = revision.template_id
      where revision.id = ${parsed.revisionId} and template.id = ${parsed.templateId} and template.company_id = ${companyId} and template.deleted_at is null
    `
    const row = rows[0]
    if (!row) throw new Error("Revisão não encontrada")
    const design = kidLabelDesignSchema.parse(parseJsonbObject(row.design))
    const invalid = validatePublishableLabel(row.kind, design)
    if (invalid) throw new Error(invalid)
    if (row.contains_sensitive_fields) {
      if (!parsed.sensitiveConfirmed) throw new Error("Confirme o uso de dados sensíveis")
      await requirePermission("kids.health.view", companyId)
    }
    await sql.begin(async (tx) => {
      await tx`update public.kid_label_templates set is_active = false where company_id = ${companyId} and congregation_id is not distinct from ${row.congregation_id} and kind = ${row.kind} and id <> ${parsed.templateId} and deleted_at is null`
      await tx`update public.kid_label_template_revisions set status = 'superseded' where template_id = ${parsed.templateId} and status = 'published' and id <> ${parsed.revisionId}`
      await tx`update public.kid_label_template_revisions set status = 'published', published_by = ${user.id}, published_at = now() where id = ${parsed.revisionId}`
      await tx`update public.kid_label_templates set is_active = true, published_revision_id = ${parsed.revisionId}, draft_revision_id = ${parsed.revisionId}, updated_by = ${user.id} where id = ${parsed.templateId}`
    })
    await writeAuditLog({ action: row.contains_sensitive_fields ? "kids.label.sensitive_published" : "kids.label.published", entityTable: "kid_label_templates", entityId: parsed.templateId, companyId, metadata: { revisionId: parsed.revisionId } })
    revalidatePath("/kids"); revalidatePath("/kids/recepcao")
    return { ok: true, id: parsed.revisionId }
  } catch (error) { return failure(error) }
}

export async function restoreKidLabelRevision(input: unknown): Promise<LabelResult> {
  try {
    const parsed = z.object({ templateId: z.string().uuid(), revisionId: z.string().uuid(), sensitiveConfirmed: z.boolean().default(false) }).parse(input)
    const { companyId } = await context()
    const rows = await getSql()<(RevisionRow & { template_name: string })[]>`select revision.*, template.name as template_name from public.kid_label_template_revisions revision join public.kid_label_templates template on template.id = revision.template_id where revision.id = ${parsed.revisionId} and template.id = ${parsed.templateId} and template.company_id = ${companyId}`
    if (!rows[0]) throw new Error("Revisão não encontrada")
    const saved = await saveKidLabelDraft({ templateId: parsed.templateId, name: rows[0].template_name, widthMm: Number(rows[0].width_mm), heightMm: Number(rows[0].height_mm), dpi: rows[0].dpi, design: kidLabelDesignSchema.parse(parseJsonbObject(rows[0].design)) })
    if (!saved.ok || !saved.revision) return saved
    const published = await publishKidLabelRevision({ templateId: parsed.templateId, revisionId: saved.revision.id, sensitiveConfirmed: parsed.sensitiveConfirmed })
    if (published.ok) await writeAuditLog({ action: "kids.label.restored", entityTable: "kid_label_templates", entityId: parsed.templateId, companyId, metadata: { sourceRevisionId: parsed.revisionId, revisionId: saved.revision.id } })
    return published
  } catch (error) { return failure(error) }
}

export async function duplicateKidLabelTemplate(input: unknown): Promise<LabelResult> {
  try {
    const templateId = z.string().uuid().parse(input)
    const { user, companyId } = await context()
    const sql = getSql()
    const source = await sql<(RevisionRow & { name: string; kind: KidLabelKind; congregation_id: string | null })[]>`
      select revision.*, template.name, template.kind, template.congregation_id
      from public.kid_label_templates template join public.kid_label_template_revisions revision on revision.id = coalesce(template.draft_revision_id, template.published_revision_id)
      where template.id = ${templateId} and template.company_id = ${companyId} and template.deleted_at is null
    `
    if (!source[0]) throw new Error("Modelo não encontrado")
    const created = await sql.begin(async (tx) => {
      const templates = await tx<{ id: string }[]>`insert into public.kid_label_templates (company_id, congregation_id, kind, name, is_active, created_by, updated_by) values (${companyId}, ${source[0].congregation_id}, ${source[0].kind}, ${`${source[0].name} — cópia`}, false, ${user.id}, ${user.id}) returning id`
      const revision = await tx<{ id: string }[]>`insert into public.kid_label_template_revisions (company_id, template_id, version, status, schema_version, width_mm, height_mm, dpi, design, contains_sensitive_fields, created_by) values (${companyId}, ${templates[0].id}, 1, 'draft', ${source[0].schema_version}, ${source[0].width_mm}, ${source[0].height_mm}, ${source[0].dpi}, ${tx.json(JSON.parse(JSON.stringify(parseJsonbObject(source[0].design))))}, ${source[0].contains_sensitive_fields}, ${user.id}) returning id`
      await tx`update public.kid_label_templates set draft_revision_id = ${revision[0].id} where id = ${templates[0].id}`
      return templates[0].id
    })
    await writeAuditLog({ action: "kids.label.duplicated", entityTable: "kid_label_templates", entityId: created, companyId, metadata: { sourceTemplateId: templateId } })
    return { ok: true, id: created }
  } catch (error) { return failure(error) }
}

export async function archiveKidLabelTemplate(input: unknown): Promise<LabelResult> {
  try {
    const templateId = z.string().uuid().parse(input)
    const { user, companyId } = await context()
    const rows = await getSql()<{ id: string }[]>`update public.kid_label_templates set is_active = false, deleted_at = now(), updated_by = ${user.id} where id = ${templateId} and company_id = ${companyId} and deleted_at is null returning id`
    if (!rows[0]) throw new Error("Modelo não encontrado")
    await writeAuditLog({ action: "kids.label.archived", entityTable: "kid_label_templates", entityId: templateId, companyId })
    revalidatePath("/kids"); revalidatePath("/kids/recepcao")
    return { ok: true, id: templateId }
  } catch (error) { return failure(error) }
}

export async function uploadKidLabelAsset(formData: FormData): Promise<LabelResult> {
  try {
    const templateId = z.string().uuid().parse(formData.get("templateId"))
    const file = getOptionalFile(formData, "file")
    if (!file) throw new Error("Selecione uma imagem")
    const { user, companyId } = await context()
    const template = await getSql()<{ id: string }[]>`select id from public.kid_label_templates where id = ${templateId} and company_id = ${companyId} and deleted_at is null`
    if (!template[0]) throw new Error("Modelo não encontrado")
    const uploaded = await uploadManagedFile({ file, companyId, ownerProfileId: user.id, entityTable: "kid_label_templates", entityId: templateId, purpose: "label-asset", visibility: "private", allowedMimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]), maxSizeBytes: 10 * 1024 * 1024 })
    const row = await getSql()<{ storage_path: string }[]>`select storage_path from public.app_files where id = ${uploaded.id}`
    const urls = await createSignedUrlsByStoragePath([row[0].storage_path])
    await writeAuditLog({ action: "kids.label.asset_uploaded", entityTable: "kid_label_templates", entityId: templateId, companyId, metadata: { fileId: uploaded.id, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes } })
    return { ok: true, file: { id: uploaded.id, url: urls.get(row[0].storage_path) ?? "" } }
  } catch (error) { return failure(error) }
}

export async function removeKidLabelAsset(input: unknown): Promise<LabelResult> {
  try {
    const parsed = z.object({ templateId: z.string().uuid(), fileId: z.string().uuid() }).parse(input)
    const { companyId } = await context()
    const linked = await getSql()<{ id: string }[]>`select id from public.app_files where id = ${parsed.fileId} and company_id = ${companyId} and entity_table = 'kid_label_templates' and entity_id = ${parsed.templateId}`
    if (!linked[0]) throw new Error("Imagem não encontrada")
    await deleteManagedFile(parsed.fileId, companyId)
    await writeAuditLog({ action: "kids.label.asset_removed", entityTable: "kid_label_templates", entityId: parsed.templateId, companyId, metadata: { fileId: parsed.fileId } })
    return { ok: true }
  } catch (error) { return failure(error) }
}

export async function auditKidLabelPrint(input: unknown): Promise<LabelResult> {
  try {
    const parsed = z.object({ attendanceId: z.string().uuid(), revisionIds: z.array(z.string().uuid()).max(2), mode: z.enum(["qz", "browser"]), reprint: z.boolean() }).parse(input)
    const { companyId } = await context("kids.checkin.create")
    const attendance = await getSql()<{ id: string }[]>`select id from public.kid_attendances where id = ${parsed.attendanceId} and company_id = ${companyId}`
    if (!attendance[0]) throw new Error("Presença não encontrada")
    await writeAuditLog({ action: parsed.reprint ? "kids.label.reprint_requested" : "kids.label.print_requested", entityTable: "kid_attendances", entityId: parsed.attendanceId, companyId, metadata: { revisionIds: parsed.revisionIds, mode: parsed.mode } })
    return { ok: true }
  } catch (error) { return failure(error) }
}
