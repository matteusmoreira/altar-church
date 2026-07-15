"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getCellContext, isCellAdministrator, requireCellParticipant, requireCellPermission, requireManagedCell } from "./access"
import { getSql } from "@/lib/db/client"
import { attachFileToEntity, getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { CellActionResult } from "./types"

const CELL_STUDY_MAX_BYTES = 30 * 1024 * 1024
const CELL_PHOTO_MAX_BYTES = 15 * 1024 * 1024
const CELL_PHOTO_LIMIT = 30

const uuid = z.string().uuid()
const studyMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])
const studyExtensions = new Set([".pdf", ".txt", ".doc", ".docx", ".xls", ".xlsx"])
const photoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"])
const photoExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"])

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function ids(formData: FormData, key: string) {
  return [...new Set(formData.getAll(key).filter((value): value is string => typeof value === "string" && z.string().uuid().safeParse(value).success))]
}

function failure(error: unknown): CellActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

function refresh() {
  revalidatePath("/celulas")
  revalidatePath("/presenca")
  revalidatePath("/dashboard")
}

async function audit(action: string, table: string, id: string, companyId: string, metadata: Record<string, unknown> = {}) {
  await writeAuditLog({ action, entityTable: table, entityId: id, companyId, metadata })
}

async function assertTargets(context: Awaited<ReturnType<typeof getCellContext>>, groupIds: string[]) {
  if (groupIds.length === 0) throw new Error("Selecione ao menos uma célula")
  for (const groupId of groupIds) await requireManagedCell(context, groupId)
}

export async function saveCellStudy(formData: FormData): Promise<CellActionResult> {
  try {
    const context = await requireCellPermission("cells.study.manage", text(formData, "companyId") || null)
    const title = z.string().trim().min(3, "Informe o título").max(160).parse(text(formData, "title"))
    const description = z.string().trim().max(3000).parse(text(formData, "description"))
    const scriptureRef = z.string().trim().max(300).parse(text(formData, "scriptureRef"))
    const requestedAudience = text(formData, "audience") === "all" ? "all" : "selected"
    const audience = isCellAdministrator(context.user) ? requestedAudience : "selected"
    const groupIds = ids(formData, "groupIds")
    if (audience === "selected") await assertTargets(context, groupIds)

    const file = getOptionalFile(formData, "file")
    if (!file) throw new Error("Envie o arquivo do estudo")
    const uploaded = await uploadManagedFile({
      file,
      companyId: context.companyId,
      ownerProfileId: context.user.id,
      entityTable: "group_studies",
      purpose: "study",
      metadata: { kind: "cell-study" },
      allowedMimeTypes: studyMimeTypes,
      allowedExtensions: studyExtensions,
      maxSizeBytes: CELL_STUDY_MAX_BYTES,
    })

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.group_studies (
        company_id, title, description, content_type, content, scripture_ref, audience, file_id,
        is_active, created_by, updated_by
      ) values (
        ${context.companyId}, ${title}, ${description}, 'lesson', '', ${scriptureRef}, ${audience}, ${uploaded.id},
        true, ${context.user.id}, ${context.user.id}
      ) returning id
    `
    const studyId = rows[0]?.id
    if (!studyId) throw new Error("Estudo não foi salvo")
    await attachFileToEntity({ fileId: uploaded.id, companyId: context.companyId, entityTable: "group_studies", entityId: studyId, ownerProfileId: context.user.id })
    if (audience === "selected") {
      for (const groupId of groupIds) await sql`
        insert into public.cell_study_targets (study_id, group_id, company_id)
        values (${studyId}, ${groupId}, ${context.companyId}) on conflict do nothing
      `
    }
    await audit("cell.study.upload", "group_studies", studyId, context.companyId, { audience, groupIds, fileId: uploaded.id })
    refresh()
    return { ok: true, id: studyId }
  } catch (error) {
    return failure(error)
  }
}

export async function openCellCheckin(meetingIdInput: string): Promise<CellActionResult> {
  try {
    const meetingId = uuid.parse(meetingIdInput)
    const context = await requireCellPermission("cells.checkin.manage")
    const sql = getSql()
    const meetings = await sql<{ group_id: string; expires_at: Date; study_id: string | null; report_status: string }[]>`
      select group_id, coalesce(ends_at, starts_at + interval '4 hours') as expires_at, study_id, report_status
      from public.group_meetings
      where id = ${meetingId} and company_id = ${context.companyId} and deleted_at is null
    `
    const meeting = meetings[0]
    if (!meeting) throw new Error("Encontro não encontrado")
    await requireManagedCell(context, meeting.group_id)
    if (!meeting.study_id || meeting.report_status === "cancelled") throw new Error("Encontro precisa de estudo e não pode estar cancelado")
    if (new Date(meeting.expires_at).getTime() <= Date.now()) throw new Error("Janela deste encontro já terminou")

    await sql`update public.cell_checkin_sessions set closed_at = now() where meeting_id = ${meetingId} and closed_at is null`
    const rows = await sql<{ id: string; token: string }[]>`
      insert into public.cell_checkin_sessions (company_id, group_id, meeting_id, expires_at, created_by)
      values (${context.companyId}, ${meeting.group_id}, ${meetingId}, ${meeting.expires_at}, ${context.user.id})
      returning id, token
    `
    await sql`update public.group_meetings set checkin_opened_at = now(), checkin_closed_at = null, updated_by = ${context.user.id} where id = ${meetingId}`
    if (!rows[0]) throw new Error("QR não foi gerado")
    await audit("cell.checkin.open", "cell_checkin_sessions", rows[0].id, context.companyId, { meetingId })
    refresh()
    return { ok: true, id: rows[0].id, token: rows[0].token }
  } catch (error) {
    return failure(error)
  }
}

export async function closeCellCheckin(meetingIdInput: string): Promise<CellActionResult> {
  try {
    const meetingId = uuid.parse(meetingIdInput)
    const context = await requireCellPermission("cells.checkin.manage")
    const sql = getSql()
    const meetings = await sql<{ group_id: string }[]>`select group_id from public.group_meetings where id = ${meetingId} and company_id = ${context.companyId}`
    if (!meetings[0]) throw new Error("Encontro não encontrado")
    await requireManagedCell(context, meetings[0].group_id)
    await sql.begin(async (tx) => {
      await tx`update public.cell_checkin_sessions set closed_at = coalesce(closed_at, now()) where meeting_id = ${meetingId}`
      await tx`
        update public.group_meetings meeting set
          checkin_closed_at = now(),
          report_status = 'reported',
          present_count = (select count(*)::integer from public.attendance_records attendance where attendance.event_ref_id = meeting.id and attendance.event_type = 'cell' and attendance.status = 'present' and attendance.deleted_at is null),
          visitor_count = (select count(*)::integer from public.attendance_records attendance join public.people person on person.id = attendance.person_id where attendance.event_ref_id = meeting.id and attendance.event_type = 'cell' and attendance.status = 'present' and attendance.deleted_at is null and person.status = 'visitor'),
          updated_by = ${context.user.id}, updated_at = now()
        where meeting.id = ${meetingId}
      `
    })
    await audit("cell.checkin.close", "group_meetings", meetingId, context.companyId)
    refresh()
    return { ok: true, id: meetingId }
  } catch (error) {
    return failure(error)
  }
}

export async function confirmCellCheckin(tokenInput: string): Promise<CellActionResult> {
  try {
    const token = uuid.parse(tokenInput)
    const context = await requireCellPermission("cells.self.checkin")
    if (!context.personId) throw new Error("Seu acesso não está vinculado ao cadastro de pessoa")
    const sql = getSql()
    const rows = await sql<{ session_id: string; meeting_id: string; group_id: string; cell_name: string; meeting_title: string; starts_at: Date; person_name: string }[]>`
      select session.id as session_id, session.meeting_id, session.group_id, cell.name as cell_name,
        coalesce(nullif(meeting.title, ''), cell.name) as meeting_title, meeting.starts_at, person.full_name as person_name
      from public.cell_checkin_sessions session
      join public.group_meetings meeting on meeting.id = session.meeting_id
      join public.groups cell on cell.id = session.group_id
      join public.people person on person.id = ${context.personId} and person.company_id = session.company_id and person.deleted_at is null
      where session.token = ${token} and session.company_id = ${context.companyId}
        and session.closed_at is null and now() between session.opens_at and session.expires_at
        and meeting.deleted_at is null and cell.deleted_at is null and cell.type = 'cell'
      limit 1
    `
    const row = rows[0]
    if (!row) throw new Error("QR inválido, expirado ou encerrado")
    const attendance = await sql<{ id: string }[]>`
      insert into public.attendance_records (
        company_id, person_id, person_name, event_type, event_ref_id, event_ref_name,
        occurred_on, occurred_time, status, registered_by, registered_by_name, checkin_source, checkin_session_id
      ) values (
        ${context.companyId}, ${context.personId}, ${row.person_name}, 'cell', ${row.meeting_id}, ${row.meeting_title},
        current_date, localtime, 'present', ${context.user.id}, ${context.user.name}, 'qr', ${row.session_id}
      )
      on conflict (company_id, event_ref_id, person_id) where event_type = 'cell' and person_id is not null and deleted_at is null
      do update set status = 'present', checkin_source = 'qr', checkin_session_id = excluded.checkin_session_id, updated_at = now()
      returning id
    `
    await audit("cell.checkin.qr", "attendance_records", attendance[0]?.id ?? row.meeting_id, context.companyId, { meetingId: row.meeting_id })
    refresh()
    return { ok: true, id: attendance[0]?.id }
  } catch (error) {
    return failure(error)
  }
}

export async function manualCellCheckin(formData: FormData): Promise<CellActionResult> {
  try {
    const meetingId = uuid.parse(text(formData, "meetingId"))
    const context = await requireCellPermission("cells.checkin.manage")
    const sql = getSql()
    const meetings = await sql<{ group_id: string; title: string; group_name: string }[]>`
      select meeting.group_id, meeting.title, cell.name as group_name
      from public.group_meetings meeting join public.groups cell on cell.id = meeting.group_id
      where meeting.id = ${meetingId} and meeting.company_id = ${context.companyId} and meeting.deleted_at is null
    `
    const meeting = meetings[0]
    if (!meeting) throw new Error("Encontro não encontrado")
    await requireManagedCell(context, meeting.group_id)

    let personId = text(formData, "personId")
    if (personId) personId = uuid.parse(personId)
    if (!personId) {
      const name = z.string().trim().min(2, "Informe o nome").max(200).parse(text(formData, "visitorName"))
      const phone = z.string().trim().min(8, "Informe o telefone").max(30).parse(text(formData, "visitorPhone"))
      const normalizedPhone = phone.replace(/\D/g, "")
      const existing = await sql<{ id: string }[]>`
        select id from public.people where company_id = ${context.companyId} and regexp_replace(phone, '\\D', '', 'g') = ${normalizedPhone} and deleted_at is null limit 1
      `
      personId = existing[0]?.id ?? ""
      if (!personId) {
        const names = name.split(/\s+/)
        const created = await sql<{ id: string }[]>`
          insert into public.people (company_id, first_name, last_name, full_name, phone, status, person_type, created_by, updated_by)
          values (${context.companyId}, ${names[0]}, ${names.slice(1).join(" ")}, ${name}, ${phone}, 'visitor', 'visitor', ${context.user.id}, ${context.user.id})
          returning id
        `
        personId = created[0]?.id ?? ""
      }
    }
    const people = await sql<{ id: string; full_name: string }[]>`select id, full_name from public.people where id = ${personId} and company_id = ${context.companyId} and deleted_at is null`
    if (!people[0]) throw new Error("Pessoa não encontrada")
    const rows = await sql<{ id: string }[]>`
      insert into public.attendance_records (company_id, person_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, occurred_time, status, registered_by, registered_by_name, checkin_source)
      values (${context.companyId}, ${personId}, ${people[0].full_name}, 'cell', ${meetingId}, ${meeting.title || meeting.group_name}, current_date, localtime, 'present', ${context.user.id}, ${context.user.name}, 'manual')
      on conflict (company_id, event_ref_id, person_id) where event_type = 'cell' and person_id is not null and deleted_at is null
      do update set status = 'present', checkin_source = 'manual', updated_at = now()
      returning id
    `
    await audit("cell.checkin.manual", "attendance_records", rows[0]?.id ?? meetingId, context.companyId, { meetingId, personId })
    refresh()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return failure(error)
  }
}

export async function uploadCellPhotos(formData: FormData): Promise<CellActionResult> {
  try {
    const meetingId = uuid.parse(text(formData, "meetingId"))
    const context = await requireCellPermission("cells.photo.manage")
    const sql = getSql()
    const meetings = await sql<{ group_id: string }[]>`select group_id from public.group_meetings where id = ${meetingId} and company_id = ${context.companyId} and deleted_at is null`
    if (!meetings[0]) throw new Error("Encontro não encontrado")
    await requireManagedCell(context, meetings[0].group_id)
    const files = formData.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0)
    if (files.length === 0) throw new Error("Selecione ao menos uma foto")
    const countRows = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.app_files
      where company_id = ${context.companyId} and entity_table = 'group_meetings' and entity_id = ${meetingId}
        and purpose = 'gallery' and is_active = true and deleted_at is null
    `
    const existingCount = Number(countRows[0]?.count ?? 0)
    if (existingCount + files.length > CELL_PHOTO_LIMIT) throw new Error(`Cada encontro aceita até ${CELL_PHOTO_LIMIT} fotos`)
    let lastId = ""
    for (const file of files) {
      const uploaded = await uploadManagedFile({
        file, companyId: context.companyId, ownerProfileId: context.user.id,
        entityTable: "group_meetings", entityId: meetingId, purpose: "gallery",
        metadata: { kind: "cell-gallery", groupId: meetings[0].group_id },
        allowedMimeTypes: photoMimeTypes, allowedExtensions: photoExtensions, maxSizeBytes: CELL_PHOTO_MAX_BYTES,
      })
      lastId = uploaded.id
    }
    await audit("cell.photo.upload", "group_meetings", meetingId, context.companyId, { count: files.length })
    refresh()
    return { ok: true, id: lastId }
  } catch (error) {
    return failure(error)
  }
}

export async function deleteCellPhoto(photoIdInput: string): Promise<CellActionResult> {
  try {
    const photoId = uuid.parse(photoIdInput)
    const context = await requireCellPermission("cells.photo.manage")
    const sql = getSql()
    const rows = await sql<{ entity_id: string; storage_path: string; group_id: string }[]>`
      select file.entity_id, file.storage_path, meeting.group_id
      from public.app_files file join public.group_meetings meeting on meeting.id::text = file.entity_id
      where file.id = ${photoId} and file.company_id = ${context.companyId} and file.entity_table = 'group_meetings'
        and file.purpose = 'gallery' and file.deleted_at is null
    `
    if (!rows[0]) throw new Error("Foto não encontrada")
    await requireManagedCell(context, rows[0].group_id)
    await sql`update public.app_files set is_active = false, deleted_at = now(), updated_at = now() where id = ${photoId}`
    const storage = createSupabaseAdminClient()
    if (storage) await storage.storage.from("church-assets").remove([rows[0].storage_path])
    await audit("cell.photo.delete", "app_files", photoId, context.companyId)
    refresh()
    return { ok: true, id: photoId }
  } catch (error) {
    return failure(error)
  }
}

export async function saveCellPrayer(formData: FormData): Promise<CellActionResult> {
  try {
    const groupId = uuid.parse(text(formData, "groupId"))
    const message = z.string().trim().min(3, "Escreva seu pedido").max(5000).parse(text(formData, "message"))
    const context = await requireCellPermission("cells.self.prayer")
    if (!context.personId) throw new Error("Seu acesso não está vinculado a uma pessoa")
    await requireCellParticipant(context, groupId)
    const rows = await getSql()<{ id: string }[]>`
      insert into public.cell_prayer_requests (company_id, group_id, author_profile_id, author_person_id, message)
      values (${context.companyId}, ${groupId}, ${context.user.id}, ${context.personId}, ${message}) returning id
    `
    await audit("cell.prayer.create", "cell_prayer_requests", rows[0]?.id ?? "", context.companyId, { groupId })
    refresh()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return failure(error)
  }
}

export async function updateCellPrayerStatus(idInput: string, statusInput: string): Promise<CellActionResult> {
  try {
    const id = uuid.parse(idInput)
    const status = z.enum(["open", "praying", "answered", "archived"]).parse(statusInput)
    const context = await requireCellPermission("cells.prayer.manage")
    const sql = getSql()
    const prayers = await sql<{ group_id: string }[]>`select group_id from public.cell_prayer_requests where id = ${id} and company_id = ${context.companyId} and deleted_at is null`
    if (!prayers[0]) throw new Error("Pedido não encontrado")
    await requireManagedCell(context, prayers[0].group_id)
    await sql`update public.cell_prayer_requests set status = ${status}, updated_at = now() where id = ${id}`
    await audit("cell.prayer.status", "cell_prayer_requests", id, context.companyId, { status })
    refresh()
    return { ok: true, id }
  } catch (error) {
    return failure(error)
  }
}

export async function saveCellNotice(formData: FormData): Promise<CellActionResult> {
  try {
    const context = await requireCellPermission("cells.notice.manage")
    const title = z.string().trim().min(3, "Informe o título").max(160).parse(text(formData, "title"))
    const content = z.string().trim().min(3, "Informe o aviso").max(10000).parse(text(formData, "content"))
    const requestedAudience = text(formData, "audience") === "all" ? "all" : "selected"
    const audience = isCellAdministrator(context.user) ? requestedAudience : "selected"
    const groupIds = ids(formData, "groupIds")
    if (audience === "selected") await assertTargets(context, groupIds)
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.cell_notices (company_id, title, content, audience, author_profile_id)
      values (${context.companyId}, ${title}, ${content}, ${audience}, ${context.user.id}) returning id
    `
    const noticeId = rows[0]?.id
    if (!noticeId) throw new Error("Aviso não foi salvo")
    if (audience === "selected") for (const groupId of groupIds) await sql`
      insert into public.cell_notice_targets (notice_id, group_id, company_id)
      values (${noticeId}, ${groupId}, ${context.companyId}) on conflict do nothing
    `
    await audit("cell.notice.save", "cell_notices", noticeId, context.companyId, { audience, groupIds })
    refresh()
    return { ok: true, id: noticeId }
  } catch (error) {
    return failure(error)
  }
}
