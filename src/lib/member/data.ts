import "server-only"

import { getSql } from "@/lib/db/client"
import { requireMemberContext } from "./access"
import type { MemberMinistryItem, MemberPortalSummary, MinistryMembershipAdminItem } from "./types"
import type { User } from "@/lib/types"

type DateValue = Date | string
const iso = (value: DateValue | null) => value instanceof Date ? value.toISOString() : value

export async function getMemberShellData() {
  const { user, companyId } = await requireMemberContext()
  const rows = await getSql()<{ name: string }[]>`
    select name from public.companies where id = ${companyId} and active = true limit 1
  `
  return { user, churchName: rows[0]?.name ?? "Altar Church" }
}

export async function getMemberPortalSummary(): Promise<MemberPortalSummary> {
  const { user, companyId, personId } = await requireMemberContext()
  const sql = getSql()
  const [companyRows, cellCountRows, ministryCountRows, childrenCountRows, meetingRows, noticeRows] = await Promise.all([
    sql<{ name: string }[]>`select name from public.companies where id = ${companyId} limit 1`,
    sql<{ total: number }[]>`
      select count(*)::integer as total
      from public.group_members member
      join public.groups cell on cell.id = member.group_id
      where member.company_id = ${companyId} and member.person_id = ${personId}
        and member.status = 'active' and cell.type = 'cell' and cell.deleted_at is null
    `,
    sql<{ total: number }[]>`
      select count(*)::integer as total
      from public.ministry_memberships membership
      join public.ministries ministry on ministry.id = membership.ministry_id
      where membership.company_id = ${companyId} and membership.person_id = ${personId}
        and membership.status = 'active' and ministry.deleted_at is null and ministry.is_active = true
    `,
    sql<{ total: number }[]>`
      select count(distinct guardian.kid_id)::integer as total
      from public.kid_guardians guardian
      join public.kid_profiles kid on kid.id = guardian.kid_id and kid.deleted_at is null
      where guardian.company_id = ${companyId}
        and (guardian.profile_id = ${user.id} or guardian.person_id = ${personId})
        and guardian.deleted_at is null
    `,
    sql<{ title: string; cell_name: string; starts_at: DateValue }[]>`
      select coalesce(nullif(meeting.title, ''), cell.name) as title,
        cell.name as cell_name, meeting.starts_at
      from public.group_members member
      join public.groups cell on cell.id = member.group_id
      join public.group_meetings meeting on meeting.group_id = cell.id
      where member.company_id = ${companyId} and member.person_id = ${personId}
        and member.status = 'active' and cell.type = 'cell' and cell.deleted_at is null
        and meeting.deleted_at is null and meeting.report_status <> 'cancelled'
        and meeting.starts_at >= now() - interval '2 hours'
      order by meeting.starts_at
      limit 1
    `,
    sql<{ id: string; title: string; content: string; published_at: DateValue }[]>`
      select notice.id, notice.title, notice.content, notice.published_at
      from public.cell_notices notice
      left join public.cell_notice_targets target on target.notice_id = notice.id
      where notice.company_id = ${companyId}
        and notice.deleted_at is null and notice.is_active = true
        and (
          notice.audience = 'all'
          or target.group_id in (
            select member.group_id from public.group_members member
            where member.company_id = ${companyId} and member.person_id = ${personId}
              and member.status = 'active'
          )
        )
      group by notice.id
      order by notice.published_at desc
      limit 3
    `,
  ])
  const meeting = meetingRows[0]
  return {
    memberName: user.name,
    churchName: companyRows[0]?.name ?? "Altar Church",
    cellCount: cellCountRows[0]?.total ?? 0,
    ministryCount: ministryCountRows[0]?.total ?? 0,
    childrenCount: childrenCountRows[0]?.total ?? 0,
    nextMeeting: meeting ? {
      title: meeting.title,
      cellName: meeting.cell_name,
      startsAt: iso(meeting.starts_at) ?? "",
    } : null,
    notices: noticeRows.map((notice) => ({
      id: notice.id,
      title: notice.title,
      content: notice.content,
      publishedAt: iso(notice.published_at) ?? "",
    })),
  }
}

export async function listMemberMinistries(): Promise<MemberMinistryItem[]> {
  const { companyId, personId } = await requireMemberContext()
  const rows = await getSql()<{
    id: string
    name: string
    description: string
    contact: string
    leader_name: string | null
    member_count: number
    membership_id: string | null
    membership_status: MemberMinistryItem["membershipStatus"]
  }[]>`
    select ministry.id, ministry.name, ministry.description, ministry.contact,
      leader.full_name as leader_name,
      count(active_member.id) filter (where active_member.status = 'active')::integer as member_count,
      own.id as membership_id, own.status as membership_status
    from public.ministries ministry
    left join public.people leader on leader.id = ministry.leader_person_id
    left join public.ministry_memberships active_member on active_member.ministry_id = ministry.id
    left join public.ministry_memberships own
      on own.ministry_id = ministry.id and own.person_id = ${personId}
    where ministry.company_id = ${companyId}
      and ministry.deleted_at is null and ministry.is_active = true
    group by ministry.id, leader.full_name, own.id, own.status
    order by (own.status = 'active') desc, ministry.name
  `
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    contact: row.contact,
    leaderName: row.leader_name,
    memberCount: row.member_count,
    membershipId: row.membership_id,
    membershipStatus: row.membership_status,
  }))
}

export async function listManagedMinistryMemberships(user: User): Promise<MinistryMembershipAdminItem[]> {
  if (!user.churchId || !["superadmin", "admin", "pastor", "ministry_leader"].includes(user.role)) return []
  const rows = await getSql()<{
    id: string
    ministry_id: string
    ministry_name: string
    person_id: string
    person_name: string
    role: "member" | "leader"
    status: MinistryMembershipAdminItem["status"]
    requested_at: DateValue
    reviewed_at: DateValue | null
  }[]>`
    select membership.id, membership.ministry_id, ministry.name as ministry_name,
      membership.person_id, person.full_name as person_name, membership.role,
      membership.status, membership.requested_at, membership.reviewed_at
    from public.ministry_memberships membership
    join public.ministries ministry on ministry.id = membership.ministry_id
    join public.people person on person.id = membership.person_id
    left join public.profiles profile on profile.id = ${user.id}
    where membership.company_id = ${user.churchId}
      and ministry.deleted_at is null
      and (
        ${user.role} <> 'ministry_leader'
        or ministry.leader_person_id = profile.person_id
      )
    order by (membership.status = 'pending') desc, membership.updated_at desc
  `
  return rows.map((row) => ({
    id: row.id,
    ministryId: row.ministry_id,
    ministryName: row.ministry_name,
    personId: row.person_id,
    personName: row.person_name,
    role: row.role,
    status: row.status,
    requestedAt: iso(row.requested_at) ?? "",
    reviewedAt: iso(row.reviewed_at),
  }))
}
