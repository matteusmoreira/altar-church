import "server-only"

import { hasPermission } from "@/lib/types"
import { getCellContext, requireCellPermission } from "./access"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import type {
  CellAttendance,
  CellCheckinPreview,
  CellCheckinSession,
  CellFeaturesData,
  CellNotice,
  CellPhoto,
  CellPortalMeeting,
  CellPrayerRequest,
  CellStudyFile,
} from "./types"

type DateValue = Date | string
const iso = (value: DateValue | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null

export async function getCellFeaturesData(): Promise<CellFeaturesData> {
  const baseContext = await getCellContext()
  const manager = hasPermission(baseContext.user.role, "cells.view") && ["superadmin", "admin", "cell_supervisor", "cell_leader"].includes(baseContext.user.role)
  const context = manager ? await requireCellPermission("cells.view") : await requireCellPermission("cells.self.view")
  const sql = getSql()

  const cellRows = manager
    ? await sql<{ id: string; name: string }[]>`
        select id, name from public.groups cell
        where cell.company_id = ${context.companyId} and cell.type = 'cell' and cell.deleted_at is null
          and (${context.user.role} not in ('cell_supervisor', 'cell_leader')
            or (${context.user.role} = 'cell_supervisor' and cell.coordinator_person_id = ${context.personId})
            or (${context.user.role} = 'cell_leader' and cell.leader_person_id = ${context.personId}))
        order by name
      `
    : context.personId
      ? await sql<{ id: string; name: string }[]>`
          select cell.id, cell.name from public.group_members member
          join public.groups cell on cell.id = member.group_id
          where member.company_id = ${context.companyId} and member.person_id = ${context.personId}
            and member.status = 'active' and cell.type = 'cell' and cell.deleted_at is null
          order by cell.name
        `
      : []
  const cellIds = cellRows.map((cell) => cell.id)

  const people = manager
    ? await sql<{ id: string; full_name: string; phone: string; status: string }[]>`
        select id, full_name, phone, status from public.people
        where company_id = ${context.companyId} and deleted_at is null and is_active = true order by full_name limit 500
      `
    : []

  if (cellIds.length === 0) {
    return { mode: manager ? "manager" : "portal", personId: context.personId, cells: [], people: [], meetings: [], studies: [], sessions: [], attendance: [], prayers: [], notices: [] }
  }

  const [studyRows, meetingRows, photoRows, sessionRows, attendanceRows, prayerRows, noticeRows] = await Promise.all([
    sql<{ id: string; title: string; description: string; scripture_ref: string; audience: "all" | "selected"; original_name: string; storage_path: string; created_at: DateValue; group_ids: string[] }[]>`
      select study.id, study.title, study.description, study.scripture_ref, study.audience,
        file.original_name, file.storage_path, study.created_at,
        coalesce(array_agg(distinct target.group_id) filter (where target.group_id is not null), '{}') as group_ids
      from public.group_studies study
      join public.app_files file on file.id = study.file_id and file.is_active = true and file.deleted_at is null
      left join public.cell_study_targets target on target.study_id = study.id
      where study.company_id = ${context.companyId} and study.deleted_at is null and study.is_active = true
        and (study.audience = 'all' or target.group_id = any(${cellIds}))
      group by study.id, file.original_name, file.storage_path
      order by study.created_at desc
    `,
    sql<{ id: string; group_id: string; group_name: string; title: string; starts_at: DateValue; study_id: string | null }[]>`
      select meeting.id, meeting.group_id, cell.name as group_name, coalesce(nullif(meeting.title, ''), cell.name) as title,
        meeting.starts_at, meeting.study_id
      from public.group_meetings meeting join public.groups cell on cell.id = meeting.group_id
      where meeting.company_id = ${context.companyId} and meeting.group_id = any(${cellIds})
        and meeting.deleted_at is null and meeting.report_status <> 'cancelled'
      order by meeting.starts_at desc limit 200
    `,
    sql<{ id: string; meeting_id: string; group_id: string; original_name: string; storage_path: string; created_at: DateValue }[]>`
      select file.id, meeting.id as meeting_id, meeting.group_id, file.original_name, file.storage_path, file.created_at
      from public.app_files file join public.group_meetings meeting on meeting.id::text = file.entity_id
      where file.company_id = ${context.companyId} and file.entity_table = 'group_meetings' and file.purpose = 'gallery'
        and file.is_active = true and file.deleted_at is null and meeting.group_id = any(${cellIds})
      order by meeting.starts_at desc, file.created_at
    `,
    manager ? sql<{ id: string; meeting_id: string; group_id: string; token: string; opens_at: DateValue; expires_at: DateValue; closed_at: DateValue | null }[]>`
      select id, meeting_id, group_id, token::text, opens_at, expires_at, closed_at
      from public.cell_checkin_sessions where company_id = ${context.companyId} and group_id = any(${cellIds})
      order by created_at desc limit 100
    ` : Promise.resolve([]),
    manager ? sql<{ id: string; event_ref_id: string; person_id: string | null; person_name: string; checkin_source: "qr" | "manual"; occurred_on: string; occurred_time: string | null; visitor: boolean }[]>`
      select attendance.id, attendance.event_ref_id, attendance.person_id, attendance.person_name, attendance.checkin_source,
        attendance.occurred_on::text, attendance.occurred_time::text,
        coalesce(person.status = 'visitor', false) as visitor
      from public.attendance_records attendance
      join public.group_meetings meeting on meeting.id = attendance.event_ref_id
      left join public.people person on person.id = attendance.person_id
      where attendance.company_id = ${context.companyId} and attendance.event_type = 'cell' and attendance.deleted_at is null
        and meeting.group_id = any(${cellIds}) order by attendance.created_at desc limit 500
    ` : Promise.resolve([]),
    manager ? sql<{ id: string; group_id: string; group_name: string; author_name: string; author_profile_id: string; message: string; status: "open" | "praying" | "answered" | "archived"; created_at: DateValue }[]>`
      select prayer.id, prayer.group_id, cell.name as group_name, person.full_name as author_name,
        prayer.author_profile_id, prayer.message, prayer.status, prayer.created_at
      from public.cell_prayer_requests prayer
      join public.groups cell on cell.id = prayer.group_id join public.people person on person.id = prayer.author_person_id
      where prayer.company_id = ${context.companyId} and prayer.group_id = any(${cellIds}) and prayer.deleted_at is null
      order by prayer.created_at desc
    ` : sql<{ id: string; group_id: string; group_name: string; author_name: string; author_profile_id: string; message: string; status: "open" | "praying" | "answered" | "archived"; created_at: DateValue }[]>`
      select prayer.id, prayer.group_id, cell.name as group_name, person.full_name as author_name,
        prayer.author_profile_id, prayer.message, prayer.status, prayer.created_at
      from public.cell_prayer_requests prayer
      join public.groups cell on cell.id = prayer.group_id join public.people person on person.id = prayer.author_person_id
      where prayer.company_id = ${context.companyId} and prayer.author_profile_id = ${context.user.id} and prayer.deleted_at is null
      order by prayer.created_at desc
    `,
    sql<{ id: string; title: string; content: string; audience: "all" | "selected"; author_name: string; published_at: DateValue; group_ids: string[] }[]>`
      select notice.id, notice.title, notice.content, notice.audience, coalesce(profile.name, '') as author_name,
        notice.published_at, coalesce(array_agg(distinct target.group_id) filter (where target.group_id is not null), '{}') as group_ids
      from public.cell_notices notice left join public.profiles profile on profile.id = notice.author_profile_id
      left join public.cell_notice_targets target on target.notice_id = notice.id
      where notice.company_id = ${context.companyId} and notice.deleted_at is null and notice.is_active = true
        and (notice.audience = 'all' or target.group_id = any(${cellIds}))
      group by notice.id, profile.name order by notice.published_at desc
    `,
  ])

  const urls = await createSignedUrlsByStoragePath([...studyRows.map((row) => row.storage_path), ...photoRows.map((row) => row.storage_path)], 3600)
  const studies: CellStudyFile[] = studyRows.map((row) => ({
    id: row.id, title: row.title, description: row.description, scriptureRef: row.scripture_ref,
    fileName: row.original_name, fileUrl: urls.get(row.storage_path) ?? "", audience: row.audience,
    groupIds: row.group_ids, createdAt: iso(row.created_at) ?? "",
  }))
  const studyById = new Map(studies.map((study) => [study.id, study]))
  const photos: CellPhoto[] = photoRows.map((row) => ({
    id: row.id, meetingId: row.meeting_id, groupId: row.group_id, fileName: row.original_name,
    url: urls.get(row.storage_path) ?? "", createdAt: iso(row.created_at) ?? "",
  }))
  const meetings: CellPortalMeeting[] = meetingRows.map((row) => ({
    id: row.id, groupId: row.group_id, groupName: row.group_name, title: row.title,
    startsAt: iso(row.starts_at) ?? "", study: row.study_id ? studyById.get(row.study_id) ?? null : null,
    photos: photos.filter((photo) => photo.meetingId === row.id),
  }))
  const sessions: CellCheckinSession[] = sessionRows.map((row) => ({
    id: row.id, meetingId: row.meeting_id, groupId: row.group_id, token: row.token,
    opensAt: iso(row.opens_at) ?? "", expiresAt: iso(row.expires_at) ?? "", closedAt: iso(row.closed_at),
    active: !row.closed_at && new Date(row.expires_at).getTime() > Date.now(),
  }))
  const attendance: CellAttendance[] = attendanceRows.map((row) => ({
    id: row.id, meetingId: row.event_ref_id, personId: row.person_id, personName: row.person_name,
    source: row.checkin_source ?? "manual", occurredAt: `${row.occurred_on}T${row.occurred_time ?? "00:00:00"}`, visitor: row.visitor,
  }))
  const prayers: CellPrayerRequest[] = prayerRows.map((row) => ({
    id: row.id, groupId: row.group_id, groupName: row.group_name, authorName: row.author_name,
    message: row.message, status: row.status, own: row.author_profile_id === context.user.id, createdAt: iso(row.created_at) ?? "",
  }))
  const notices: CellNotice[] = noticeRows.map((row) => ({
    id: row.id, title: row.title, content: row.content, audience: row.audience, groupIds: row.group_ids,
    authorName: row.author_name, publishedAt: iso(row.published_at) ?? "",
  }))

  return {
    mode: manager ? "manager" : "portal", personId: context.personId, cells: cellRows,
    people: people.map((person) => ({ id: person.id, name: person.full_name, phone: person.phone, visitor: person.status === "visitor" })),
    meetings, studies, sessions, attendance, prayers, notices,
  }
}

export async function getCellCheckinPreview(tokenInput: string): Promise<CellCheckinPreview | null> {
  const token = tokenInput.trim()
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const context = await requireCellPermission("cells.self.checkin")
  const rows = await getSql()<{ token: string; cell_name: string; meeting_title: string; starts_at: DateValue; expires_at: DateValue; available: boolean; already_checked_in: boolean }[]>`
    select session.token::text, cell.name as cell_name, coalesce(nullif(meeting.title, ''), cell.name) as meeting_title,
      meeting.starts_at, session.expires_at,
      (session.closed_at is null and now() between session.opens_at and session.expires_at) as available,
      exists(select 1 from public.attendance_records attendance where attendance.company_id = session.company_id
        and attendance.event_ref_id = meeting.id and attendance.person_id = ${context.personId}
        and attendance.event_type = 'cell' and attendance.deleted_at is null) as already_checked_in
    from public.cell_checkin_sessions session join public.group_meetings meeting on meeting.id = session.meeting_id
    join public.groups cell on cell.id = session.group_id
    where session.token = ${token} and session.company_id = ${context.companyId} limit 1
  `
  const row = rows[0]
  return row ? {
    token: row.token, cellName: row.cell_name, meetingTitle: row.meeting_title,
    startsAt: iso(row.starts_at) ?? "", expiresAt: iso(row.expires_at) ?? "",
    available: row.available, alreadyCheckedIn: row.already_checked_in,
  } : null
}
