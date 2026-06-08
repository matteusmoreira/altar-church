import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type {
  GroupCategory,
  GroupDashboardData,
  GroupFormOptions,
  GroupListFilters,
  GroupListItem,
  GroupListResult,
  GroupMember,
  GroupMemberRole,
  GroupMemberStatus,
  GroupMeeting,
  GroupStudy,
  GroupType,
} from "./types"

interface GroupRow {
  id: string
  company_id: string
  category_id: string | null
  category_name: string | null
  congregation_id: string | null
  congregation_name: string | null
  name: string
  description: string
  type: GroupType
  leader_person_id: string | null
  leader_name: string | null
  co_leader_person_id: string | null
  co_leader_name: string | null
  coordinator_person_id: string | null
  coordinator_name: string | null
  meeting_day: string
  meeting_time: string | null
  meeting_location: string
  neighborhood: string
  city: string
  max_capacity: number
  min_age: number | null
  max_age: number | null
  accepts_requests: boolean
  is_active: boolean
  member_count: string | number
  created_at: Date | string
  updated_at: Date | string
}

interface CountRow {
  total: string | number
}

interface DashboardRow {
  total: string | number
  active: string | number
  inactive: string | number
  members: string | number
  capacity: string | number
}

interface CategoryRow {
  id: string
  company_id: string
  name: string
  description: string
  sort_order: number
  is_active: boolean
}

interface StudyRow {
  id: string
  company_id: string
  title: string
  content_type: "dynamic" | "lesson" | "preaching"
  content: string
  scripture_ref: string
  is_active: boolean
}

interface MeetingRow {
  id: string
  group_id: string
  group_name: string
  study_id: string | null
  study_title: string | null
  title: string
  starts_at: Date | string
  ends_at: Date | string | null
  location: string
  notes: string
  report_status: "scheduled" | "reported" | "cancelled"
  present_count: number
  visitor_count: number
}

interface GroupMemberRow {
  id: string
  group_id: string
  group_name: string
  person_id: string
  person_name: string
  role: GroupMemberRole
  status: GroupMemberStatus
  joined_at: Date | string
  left_at: Date | string | null
}

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

function toIso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toGroup(row: GroupRow): GroupListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    congregationId: row.congregation_id,
    congregationName: row.congregation_name,
    name: row.name,
    description: row.description,
    type: row.type,
    leaderPersonId: row.leader_person_id,
    leaderName: row.leader_name,
    coLeaderPersonId: row.co_leader_person_id,
    coLeaderName: row.co_leader_name,
    coordinatorPersonId: row.coordinator_person_id,
    coordinatorName: row.coordinator_name,
    meetingDay: row.meeting_day,
    meetingTime: row.meeting_time,
    meetingLocation: row.meeting_location,
    neighborhood: row.neighborhood,
    city: row.city,
    maxCapacity: row.max_capacity,
    minAge: row.min_age,
    maxAge: row.max_age,
    acceptsRequests: row.accepts_requests,
    isActive: row.is_active,
    memberCount: toNumber(row.member_count),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function toCategory(row: CategoryRow): GroupCategory {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

function toStudy(row: StudyRow): GroupStudy {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    contentType: row.content_type,
    content: row.content,
    scriptureRef: row.scripture_ref,
    isActive: row.is_active,
  }
}

function toMeeting(row: MeetingRow): GroupMeeting {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    studyId: row.study_id,
    studyTitle: row.study_title,
    title: row.title,
    startsAt: toIso(row.starts_at) ?? "",
    endsAt: toIso(row.ends_at),
    location: row.location,
    notes: row.notes,
    reportStatus: row.report_status,
    presentCount: row.present_count,
    visitorCount: row.visitor_count,
  }
}

function toGroupMember(row: GroupMemberRow): GroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    personId: row.person_id,
    personName: row.person_name,
    role: row.role,
    status: row.status,
    joinedAt: toIso(row.joined_at) ?? "",
    leftAt: toIso(row.left_at),
  }
}

export async function listGroups(filters: GroupListFilters = {}): Promise<GroupListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requirePermission("groups.view", companyId)

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(Math.max(1, filters.pageSize ?? 20), 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const categoryId = filters.categoryId ?? "all"
  const type = filters.type ?? "all"
  const activeFilter = filters.isActive === true ? "active" : filters.isActive === false ? "inactive" : "all"
  const meetingDay = filters.meetingDay ?? "all"

  const sql = getSql()
  const [groupRows, countRows] = await Promise.all([
    sql<GroupRow[]>`
      select
        g.id,
        g.company_id,
        g.category_id,
        gc.name as category_name,
        g.congregation_id,
        cg.name as congregation_name,
        g.name,
        g.description,
        g.type,
        g.leader_person_id,
        leader.full_name as leader_name,
        g.co_leader_person_id,
        co_leader.full_name as co_leader_name,
        g.coordinator_person_id,
        coordinator.full_name as coordinator_name,
        g.meeting_day,
        g.meeting_time::text as meeting_time,
        g.meeting_location,
        g.neighborhood,
        g.city,
        g.max_capacity,
        g.min_age,
        g.max_age,
        g.accepts_requests,
        g.is_active,
        count(gm.id) filter (where gm.status = 'active') as member_count,
        g.created_at,
        g.updated_at
      from public.groups g
      left join public.group_categories gc on gc.id = g.category_id
      left join public.congregations cg on cg.id = g.congregation_id
      left join public.people leader on leader.id = g.leader_person_id
      left join public.people co_leader on co_leader.id = g.co_leader_person_id
      left join public.people coordinator on coordinator.id = g.coordinator_person_id
      left join public.group_members gm on gm.group_id = g.id
      where g.company_id = ${companyId}
        and g.deleted_at is null
        and (${search} = '' or g.name ilike ${searchPattern} or g.description ilike ${searchPattern} or coalesce(leader.full_name, '') ilike ${searchPattern})
        and (${categoryId} = 'all' or g.category_id::text = ${categoryId})
        and (${type} = 'all' or g.type = ${type})
        and (${activeFilter} = 'all' or (${activeFilter} = 'active' and g.is_active = true) or (${activeFilter} = 'inactive' and g.is_active = false))
        and (${meetingDay} = 'all' or g.meeting_day = ${meetingDay})
      group by g.id, gc.name, cg.name, leader.full_name, co_leader.full_name, coordinator.full_name
      order by g.is_active desc, g.created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<CountRow[]>`
      select count(*) as total
      from public.groups g
      left join public.people leader on leader.id = g.leader_person_id
      where g.company_id = ${companyId}
        and g.deleted_at is null
        and (${search} = '' or g.name ilike ${searchPattern} or g.description ilike ${searchPattern} or coalesce(leader.full_name, '') ilike ${searchPattern})
        and (${categoryId} = 'all' or g.category_id::text = ${categoryId})
        and (${type} = 'all' or g.type = ${type})
        and (${activeFilter} = 'all' or (${activeFilter} = 'active' and g.is_active = true) or (${activeFilter} = 'inactive' and g.is_active = false))
        and (${meetingDay} = 'all' or g.meeting_day = ${meetingDay})
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    groups: groupRows.map(toGroup),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function getGroupsDashboardData(companyIdInput?: string | null): Promise<GroupDashboardData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("groups.view", companyId)

  const sql = getSql()
  const rows = await sql<DashboardRow[]>`
    select
      count(g.id) as total,
      count(g.id) filter (where g.is_active = true) as active,
      count(g.id) filter (where g.is_active = false) as inactive,
      count(gm.id) filter (where gm.status = 'active') as members,
      coalesce(sum(g.max_capacity), 0) as capacity
    from public.groups g
    left join public.group_members gm on gm.group_id = g.id
    where g.company_id = ${companyId}
      and g.deleted_at is null
  `
  const row = rows[0]
  const members = toNumber(row?.members)
  const capacity = toNumber(row?.capacity)
  return {
    total: toNumber(row?.total),
    active: toNumber(row?.active),
    inactive: toNumber(row?.inactive),
    members,
    capacity,
    openCapacity: Math.max(0, capacity - members),
  }
}

export async function getGroupFormOptions(companyIdInput?: string | null): Promise<GroupFormOptions> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("groups.view", companyId)

  const sql = getSql()
  const [categoryRows, congregationRows, personRows, studyRows] = await Promise.all([
    sql<CategoryRow[]>`
      select id, company_id, name, description, sort_order, is_active
      from public.group_categories
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order, name
    `,
    sql<{ id: string; name: string }[]>`
      select id, name
      from public.congregations
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by name
    `,
    sql<{ id: string; full_name: string }[]>`
      select id, full_name
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
      order by full_name
      limit 300
    `,
    sql<StudyRow[]>`
      select id, company_id, title, content_type, content, scripture_ref, is_active
      from public.group_studies
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 100
    `,
  ])

  return {
    categories: categoryRows.map(toCategory),
    congregations: congregationRows,
    people: personRows.map((person) => ({ id: person.id, fullName: person.full_name })),
    studies: studyRows.map(toStudy),
  }
}

export async function listUpcomingGroupMeetings(companyIdInput?: string | null): Promise<GroupMeeting[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("groups.view", companyId)

  const sql = getSql()
  const rows = await sql<MeetingRow[]>`
    select
      gm.id,
      gm.group_id,
      g.name as group_name,
      gm.study_id,
      gs.title as study_title,
      gm.title,
      gm.starts_at,
      gm.ends_at,
      gm.location,
      gm.notes,
      gm.report_status,
      gm.present_count,
      gm.visitor_count
    from public.group_meetings gm
    join public.groups g on g.id = gm.group_id
    left join public.group_studies gs on gs.id = gm.study_id
    where gm.company_id = ${companyId}
      and gm.deleted_at is null
      and gm.starts_at >= now() - interval '1 day'
    order by gm.starts_at asc
    limit 20
  `

  return rows.map(toMeeting)
}

export async function listGroupMembers(companyIdInput?: string | null): Promise<GroupMember[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("groups.view", companyId)

  const sql = getSql()
  const rows = await sql<GroupMemberRow[]>`
    select
      gm.id,
      gm.group_id,
      g.name as group_name,
      gm.person_id,
      p.full_name as person_name,
      gm.role,
      gm.status,
      gm.joined_at,
      gm.left_at
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    join public.people p on p.id = gm.person_id
    where gm.company_id = ${companyId}
      and g.deleted_at is null
      and p.deleted_at is null
    order by g.name, gm.status, gm.role, p.full_name
    limit 500
  `

  return rows.map(toGroupMember)
}

export async function listGroupMeetingReports(companyIdInput?: string | null): Promise<GroupMeeting[]> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("groups.view", companyId)

  const sql = getSql()
  const rows = await sql<MeetingRow[]>`
    select
      gm.id,
      gm.group_id,
      g.name as group_name,
      gm.study_id,
      gs.title as study_title,
      gm.title,
      gm.starts_at,
      gm.ends_at,
      gm.location,
      gm.notes,
      gm.report_status,
      gm.present_count,
      gm.visitor_count
    from public.group_meetings gm
    join public.groups g on g.id = gm.group_id
    left join public.group_studies gs on gs.id = gm.study_id
    where gm.company_id = ${companyId}
      and gm.deleted_at is null
      and g.deleted_at is null
    order by gm.starts_at desc
    limit 50
  `

  return rows.map(toMeeting)
}
