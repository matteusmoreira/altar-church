import "server-only"

import { getSql } from "@/lib/db/client"
import { parseJsonbObject } from "@/lib/db/jsonb"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { decryptHealthDetails, formatChildLabelName, labelAlertFlags } from "./security"
import { buildQrPayload } from "./printing"
import { createDefaultLabelDesign, kidLabelDesignSchema } from "./label-design"
import { listPersonKidCustomValues } from "./custom-fields"
import type { KidHealthDetails, KidLabelDesign, KidLabelKind, KidLabelRenderContext, KidPrintableLabel } from "./types"

type DateValue = Date | string | null
const displayDate = (value: DateValue) => value ? new Date(value).toLocaleDateString("pt-BR") : ""
const displayTime = (value: DateValue) => value ? new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""

interface RevisionRow {
  id: string; width_mm: string | number; height_mm: string | number; dpi: 203 | 300 | 600; design: unknown
}

async function hydrateDesignAssets(companyId: string, design: KidLabelDesign) {
  const ids = [...new Set([design.backgroundAssetId, ...design.elements.map((item) => item.assetId)].filter(Boolean) as string[])]
  if (!ids.length) return design
  const rows = await getSql()<{ id: string; storage_path: string }[]>`select id, storage_path from public.app_files where company_id = ${companyId} and id = any(${ids}) and is_active = true and deleted_at is null`
  const urls = await createSignedUrlsByStoragePath(rows.map((row) => row.storage_path), 3600)
  const byId = new Map(rows.map((row) => [row.id, urls.get(row.storage_path) ?? ""]))
  return { ...design, backgroundAssetUrl: design.backgroundAssetId ? byId.get(design.backgroundAssetId) ?? null : null,
    elements: design.elements.map((item) => ({ ...item, assetUrl: item.assetId ? byId.get(item.assetId) ?? null : item.assetUrl })) }
}

export async function resolvePublishedLabelRevisionIds(companyId: string, congregationId: string | null) {
  const rows = await getSql()<{ kind: KidLabelKind; published_revision_id: string }[]>`
    select distinct on (template.kind) template.kind, template.published_revision_id
    from public.kid_label_templates template
    where template.company_id = ${companyId} and template.is_active = true and template.deleted_at is null
      and template.published_revision_id is not null
      and (template.congregation_id = ${congregationId} or template.congregation_id is null)
    order by template.kind, (template.congregation_id is not null) desc
  `
  return {
    child: rows.find((row) => row.kind === "child")?.published_revision_id ?? null,
    guardian: rows.find((row) => row.kind === "guardian")?.published_revision_id ?? null,
  }
}

async function getRevision(companyId: string, revisionId: string | null, kind: KidLabelKind): Promise<{ id: string | null; widthMm: number; heightMm: number; dpi: 203 | 300 | 600; design: KidLabelDesign }> {
  if (revisionId) {
    const rows = await getSql()<RevisionRow[]>`select id, width_mm, height_mm, dpi, design from public.kid_label_template_revisions where id = ${revisionId} and company_id = ${companyId}`
    if (rows[0]) return { id: rows[0].id, widthMm: Number(rows[0].width_mm), heightMm: Number(rows[0].height_mm), dpi: rows[0].dpi, design: await hydrateDesignAssets(companyId, kidLabelDesignSchema.parse(parseJsonbObject(rows[0].design))) }
  }
  return { id: null, widthMm: 62, heightMm: 40, dpi: 203, design: createDefaultLabelDesign(kind) }
}

export async function buildAttendancePrintableLabels(input: { companyId: string; attendanceId: string; pickupPin: string; pickupToken: string }): Promise<KidPrintableLabel[]> {
  const sql = getSql()
  const rows = await sql<{
    child_label_revision_id: string | null; guardian_label_revision_id: string | null; checked_in_at: DateValue; status: string
    child_person_id: string; child_full_name: string; birth_date: DateValue; is_visitor: boolean; child_notes: string; child_photo_path: string | null
    classroom_name: string; session_title: string; congregation_name: string | null; church_name: string
    guardian_person_id: string | null; guardian_full_name: string | null; guardian_phone: string | null; guardian_email: string | null
    has_allergy: boolean | null; has_dietary_restriction: boolean | null; has_medication: boolean | null; has_special_needs: boolean | null; details_encrypted: string | null
    consent_types: string[] | null
  }[]>`
    select attendance.child_label_revision_id, attendance.guardian_label_revision_id, attendance.checked_in_at, attendance.status,
      child_person.id as child_person_id, child_person.full_name as child_full_name, child_person.birth_date, child.is_visitor, child.notes as child_notes, child_photo.storage_path as child_photo_path,
      attendance.classroom_name, session.title as session_title, congregation.name as congregation_name, company.name as church_name,
      guardian_person.id as guardian_person_id, guardian_person.full_name as guardian_full_name, guardian_person.phone as guardian_phone, guardian_person.email as guardian_email,
      health.has_allergy, health.has_dietary_restriction, health.has_medication, health.has_special_needs, health.details_encrypted,
      coalesce((select array_agg(consent_type order by consent_type) from public.kid_consents where kid_id = child.id and status = 'granted'), '{}'::text[]) as consent_types
    from public.kid_attendances attendance
    join public.kid_profiles child on child.id = attendance.kid_id
    join public.people child_person on child_person.id = child.person_id
    join public.kid_sessions session on session.id = attendance.session_id
    join public.companies company on company.id = attendance.company_id
    left join public.congregations congregation on congregation.id = session.congregation_id
    left join public.kid_health_profiles health on health.kid_id = child.id and health.deleted_at is null
    left join public.app_files child_photo on child_photo.id = child_person.photo_file_id and child_photo.is_active = true and child_photo.deleted_at is null
    left join lateral (
      select link.person_id from public.kid_guardians link where link.kid_id = child.id and link.can_checkout = true and link.deleted_at is null order by link.is_primary desc, link.created_at limit 1
    ) pickup_guardian on true
    left join public.people guardian_person on guardian_person.id = pickup_guardian.person_id
    where attendance.id = ${input.attendanceId} and attendance.company_id = ${input.companyId}
  `
  const row = rows[0]
  if (!row) throw new Error("Presença não encontrada")
  const details: KidHealthDetails = row.details_encrypted ? JSON.parse(decryptHealthDetails(row.details_encrypted)) as KidHealthDetails : { allergies: "", dietaryRestrictions: "", medication: "", specialNeeds: "", instructions: "" }
  const flags = labelAlertFlags({ hasAllergy: Boolean(row.has_allergy), hasDietaryRestriction: Boolean(row.has_dietary_restriction), hasMedication: Boolean(row.has_medication), hasSpecialNeeds: Boolean(row.has_special_needs) })
  const photoUrls = await createSignedUrlsByStoragePath([row.child_photo_path ?? ""], 3600)
  const customValues = await listPersonKidCustomValues([row.child_person_id, row.guardian_person_id ?? ""].filter(Boolean))
  const customFields: Record<string, string> = {}
  for (const item of customValues.get(row.child_person_id) ?? []) customFields[`child.${item.fieldId}`] = Array.isArray(item.value) ? item.value.join(", ") : typeof item.value === "boolean" ? (item.value ? "Sim" : "Não") : String(item.value)
  for (const item of customValues.get(row.guardian_person_id ?? "") ?? []) customFields[`guardian.${item.fieldId}`] = Array.isArray(item.value) ? item.value.join(", ") : typeof item.value === "boolean" ? (item.value ? "Sim" : "Não") : String(item.value)
  const guardianFullName = row.guardian_full_name ?? ""
  const context: KidLabelRenderContext = {
    childName: formatChildLabelName(row.child_full_name), childFullName: row.child_full_name, childBirthDate: displayDate(row.birth_date),
    childAge: row.birth_date ? `${Math.max(0, Math.floor((Date.now() - new Date(row.birth_date).getTime()) / 31_556_952_000))} anos` : "",
    childNotes: row.child_notes ?? "", childPhotoUrl: row.child_photo_path ? photoUrls.get(row.child_photo_path) ?? "" : "", attendanceStatus: row.status === "checked_in" ? "Check-in confirmado" : row.status,
    visitorStatus: row.is_visitor ? "Visitante" : "Membro",
    guardianName: formatChildLabelName(guardianFullName), guardianFullName, guardianPhone: row.guardian_phone ?? "", guardianEmail: row.guardian_email ?? "",
    churchName: row.church_name, congregationName: row.congregation_name ?? "", classroomName: row.classroom_name, sessionTitle: row.session_title,
    checkedInAt: displayTime(row.checked_in_at), pickupCode: input.pickupPin, qrPayload: buildQrPayload(input.pickupToken),
    consentSummary: (row.consent_types ?? []).join(", "), alertSummary: flags.join(" · "), allergies: details.allergies ?? "",
    dietaryRestrictions: details.dietaryRestrictions ?? "", medication: details.medication ?? "", specialNeeds: details.specialNeeds ?? "", healthInstructions: details.instructions ?? "", customFields,
  }
  const [child, guardian] = await Promise.all([getRevision(input.companyId, row.child_label_revision_id, "child"), getRevision(input.companyId, row.guardian_label_revision_id, "guardian")])
  return [
    { kind: "child", revisionId: child.id, widthMm: child.widthMm, heightMm: child.heightMm, dpi: child.dpi, design: child.design, context },
    { kind: "guardian", revisionId: guardian.id, widthMm: guardian.widthMm, heightMm: guardian.heightMm, dpi: guardian.dpi, design: guardian.design, context },
  ]
}
