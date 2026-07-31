import "server-only"

import { hasPermission } from "@/lib/types"
import { getCellContext, isCellAdministrator, requireCellPermission } from "./access"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { sanitizeCellNoticeHtml } from "./rich-content"
import type {
  CellAttendance,
  CellCheckinPreview,
  CellCheckinSession,
  CellFeaturesData,
  CellLeaderWorkspaceData,
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
  const leader = baseContext.user.role === "cell_leader"
  const manager = hasPermission(baseContext.user.role, "cells.view") && ["superadmin", "admin", "cell_supervisor"].includes(baseContext.user.role)
  const canPublishToAll = isCellAdministrator(baseContext.user)
  const operationsManager = manager || leader
  const context = leader
    ? await requireCellPermission("cells.leader.manage")
    : manager
      ? await requireCellPermission("cells.view")
      : await requireCellPermission("cells.self.view")
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
    : leader
      ? await sql<{ id: string; name: string }[]>`
          select cell.id, cell.name
          from public.groups cell
          where cell.company_id = ${context.companyId} and cell.type = 'cell'
            and cell.leader_person_id = ${context.personId} and cell.deleted_at is null and cell.is_active = true
          order by cell.name
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
    : leader && cellIds.length > 0
      ? await sql<{ id: string; full_name: string; phone: string; status: string }[]>`
          select distinct person.id, person.full_name, coalesce(person.phone, '') as phone, person.status
          from public.group_members member
          join public.people person on person.id = member.person_id
          where member.company_id = ${context.companyId} and member.group_id = any(${cellIds})
            and member.status = 'active' and person.deleted_at is null and person.is_active = true
          order by person.full_name
        `
    : []

  if (cellIds.length === 0) {
    return {
      mode: leader ? "leader" : manager ? "manager" : "portal",
      canPublishToAll,
      canDeleteStudies: leader || isCellAdministrator(context.user),
      personId: context.personId,
      cells: [], people: [], meetings: [], studies: [], sessions: [], attendance: [], prayers: [], notices: [],
      leaderWorkspace: leader ? await getCellLeaderWorkspaceData(context.companyId, context.personId) : null,
    }
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
    operationsManager ? sql<{ id: string; meeting_id: string; group_id: string; token: string; opens_at: DateValue; expires_at: DateValue; closed_at: DateValue | null }[]>`
      select id, meeting_id, group_id, token::text, opens_at, expires_at, closed_at
      from public.cell_checkin_sessions where company_id = ${context.companyId} and group_id = any(${cellIds})
      order by created_at desc limit 100
    ` : Promise.resolve([]),
    operationsManager ? sql<{ id: string; event_ref_id: string; person_id: string | null; person_name: string; checkin_source: "qr" | "manual"; occurred_on: string; occurred_time: string | null; checkin_at: DateValue | null; visitor: boolean }[]>`
      select attendance.id, attendance.event_ref_id, attendance.person_id, attendance.person_name, attendance.checkin_source,
        attendance.occurred_on::text, attendance.occurred_time::text, attendance.checkin_at,
        coalesce(person.status = 'visitor', false) as visitor
      from public.attendance_records attendance
      join public.group_meetings meeting on meeting.id = attendance.event_ref_id
      left join public.people person on person.id = attendance.person_id
      where attendance.company_id = ${context.companyId} and attendance.event_type = 'cell' and attendance.deleted_at is null
        and meeting.group_id = any(${cellIds}) order by attendance.created_at desc limit 500
    ` : Promise.resolve([]),
    operationsManager ? sql<{ id: string; group_id: string; group_name: string; author_name: string; author_profile_id: string; message: string; status: "open" | "praying" | "answered" | "archived"; created_at: DateValue }[]>`
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
  const leaderWorkspace = leader ? await getCellLeaderWorkspaceData(context.companyId, context.personId) : null
  const studies: CellStudyFile[] = studyRows.map((row) => ({
    id: row.id, title: row.title, description: row.description, scriptureRef: row.scripture_ref,
    fileName: row.original_name, fileUrl: urls.get(row.storage_path) ?? "", audience: row.audience,
    groupIds: row.group_ids, createdAt: iso(row.created_at) ?? "",
    canDelete: isCellAdministrator(context.user) || Boolean(leaderWorkspace?.studies.find((study) => study.id === row.id)?.canDelete),
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
    source: row.checkin_source ?? "manual", occurredAt: iso(row.checkin_at) ?? `${row.occurred_on}T${row.occurred_time ?? "00:00:00"}`, visitor: row.visitor,
  }))
  const prayers: CellPrayerRequest[] = prayerRows.map((row) => ({
    id: row.id, groupId: row.group_id, groupName: row.group_name, authorName: row.author_name,
    message: row.message, status: row.status, own: row.author_profile_id === context.user.id, createdAt: iso(row.created_at) ?? "",
  }))
  const notices: CellNotice[] = noticeRows.map((row) => ({
    id: row.id, title: row.title, content: sanitizeCellNoticeHtml(row.content), audience: row.audience, groupIds: row.group_ids,
    authorName: row.author_name, publishedAt: iso(row.published_at) ?? "",
  }))

  return {
    mode: leader ? "leader" : manager ? "manager" : "portal", canPublishToAll,
    canDeleteStudies: leader || isCellAdministrator(context.user), personId: context.personId, cells: cellRows,
    people: people.map((person) => ({ id: person.id, name: person.full_name, phone: person.phone, visitor: person.status === "visitor" })),
    meetings, studies, sessions, attendance, prayers, notices,
    leaderWorkspace,
  }
}

async function getCellLeaderWorkspaceData(companyId: string, personId: string | null): Promise<CellLeaderWorkspaceData> {
  if (!personId) return { cells: [], participants: [], studies: [], formOptions: { categories: [], congregations: [] } }
  const sql = getSql()
  const [cellRows, participantRows, categoryRows, congregationRows, studyRows] = await Promise.all([
    sql<{
      id: string
      category_id: string | null
      congregation_id: string | null
      name: string
      description: string
      meeting_day: string
      meeting_time: string | null
      meeting_location: string
      postal_code: string
      address_number: string
      address_complement: string
      neighborhood: string
      city: string
      state: string
      max_capacity: number
      min_age: number | null
      max_age: number | null
      accepts_requests: boolean
      coordinator_person_id: string | null
      coordinator_name: string | null
      member_count: string | number
    }[]>`
      select cell.id, cell.category_id, cell.congregation_id, cell.name, cell.description, cell.meeting_day,
        cell.meeting_time::text as meeting_time, cell.meeting_location,
        cell.postal_code, cell.address_number, cell.address_complement,
        cell.neighborhood, cell.city, cell.state, cell.max_capacity,
        cell.min_age, cell.max_age, cell.accepts_requests,
        cell.coordinator_person_id, coordinator.full_name as coordinator_name,
        count(member.id) filter (where member.status = 'active') as member_count
      from public.groups cell
      left join public.group_members member on member.group_id = cell.id
      left join public.people coordinator on coordinator.id = cell.coordinator_person_id and coordinator.deleted_at is null
      where cell.company_id = ${companyId}
        and cell.type = 'cell'
        and cell.is_active = true
        and cell.leader_person_id = ${personId}
        and cell.deleted_at is null
      group by cell.id, coordinator.full_name
      order by cell.name
    `,
    sql<{
      id: string
      cell_id: string
      person_id: string
      name: string
      phone: string
      role: "member" | "leader" | "co_leader" | "host" | "visitor"
    }[]>`
      select member.id, member.group_id as cell_id, member.person_id,
        person.full_name as name, coalesce(person.phone, '') as phone, member.role
      from public.group_members member
      join public.groups cell on cell.id = member.group_id
      join public.people person on person.id = member.person_id
      where member.company_id = ${companyId}
        and member.status = 'active'
        and cell.type = 'cell'
        and cell.is_active = true
        and cell.leader_person_id = ${personId}
        and cell.deleted_at is null
        and person.deleted_at is null
      order by cell.name, person.full_name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.group_categories
      where company_id = ${companyId} and deleted_at is null and is_active = true
      order by sort_order, name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.congregations
      where company_id = ${companyId} and deleted_at is null and is_active = true
      order by name
    `,
    sql<{
      id: string
      title: string
      description: string
      scripture_ref: string
      audience: "all" | "selected"
      original_name: string
      storage_path: string
      created_at: DateValue
      group_ids: string[]
      can_delete: boolean
    }[]>`
      select study.id, study.title, study.description, study.scripture_ref, study.audience,
        file.original_name, file.storage_path, study.created_at,
        coalesce(array_agg(distinct target.group_id) filter (where target.group_id is not null), '{}') as group_ids,
        (
          study.audience = 'selected'
          and exists (
            select 1
            from public.cell_study_targets owned_target
            join public.groups owned_cell on owned_cell.id = owned_target.group_id
            where owned_target.study_id = study.id
              and owned_cell.company_id = ${companyId}
              and owned_cell.type = 'cell'
              and owned_cell.is_active = true
              and owned_cell.deleted_at is null
              and owned_cell.leader_person_id = ${personId}
          )
          and not exists (
            select 1
            from public.cell_study_targets other_target
            left join public.groups other_cell on other_cell.id = other_target.group_id
            where other_target.study_id = study.id
              and (
                other_target.company_id <> ${companyId}
                or other_cell.id is null
                or other_cell.company_id <> ${companyId}
                or other_cell.type <> 'cell'
                or other_cell.is_active = false
                or other_cell.deleted_at is not null
                or other_cell.leader_person_id is distinct from ${personId}
              )
          )
        ) as can_delete
      from public.group_studies study
      join public.app_files file on file.id = study.file_id and file.is_active = true and file.deleted_at is null
      left join public.cell_study_targets target on target.study_id = study.id
      where study.company_id = ${companyId}
        and study.deleted_at is null
        and study.is_active = true
        and (
          study.audience = 'all'
          or exists (
            select 1
            from public.cell_study_targets visible_target
            join public.groups visible_cell on visible_cell.id = visible_target.group_id
            where visible_target.study_id = study.id
              and visible_cell.company_id = ${companyId}
              and visible_cell.type = 'cell'
              and visible_cell.is_active = true
              and visible_cell.deleted_at is null
              and visible_cell.leader_person_id = ${personId}
          )
        )
      group by study.id, file.original_name, file.storage_path
      order by study.created_at desc
    `,
  ])
  const studyUrls = await createSignedUrlsByStoragePath(studyRows.map((study) => study.storage_path), 3600)
  return {
    cells: cellRows.map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      congregationId: row.congregation_id,
      name: row.name,
      description: row.description,
      meetingDay: row.meeting_day,
      meetingTime: row.meeting_time,
      meetingLocation: row.meeting_location,
      postalCode: row.postal_code,
      addressNumber: row.address_number,
      addressComplement: row.address_complement,
      neighborhood: row.neighborhood,
      city: row.city,
      state: row.state,
      maxCapacity: Number(row.max_capacity ?? 0),
      minAge: row.min_age,
      maxAge: row.max_age,
      acceptsRequests: row.accepts_requests,
      coordinatorPersonId: row.coordinator_person_id,
      coordinatorName: row.coordinator_name,
      memberCount: Number(row.member_count ?? 0),
    })),
    participants: participantRows.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      personId: row.person_id,
      name: row.name,
      phone: row.phone,
      role: row.role,
    })),
    studies: studyRows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      scriptureRef: row.scripture_ref,
      fileName: row.original_name,
      fileUrl: studyUrls.get(row.storage_path) ?? "",
      audience: row.audience,
      groupIds: row.group_ids,
      createdAt: iso(row.created_at) ?? "",
      canDelete: row.can_delete,
    })),
    formOptions: {
      categories: categoryRows,
      congregations: congregationRows,
    },
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
