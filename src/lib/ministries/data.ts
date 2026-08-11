import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import { requireMinistryPermission } from "./access"
import type {
  MinistryActivity,
  MinistryAttendanceRecord,
  MinistryAvailablePerson,
  MinistryCommunication,
  MinistryMember,
  MinistryProfile,
  MinistryReport,
  MinistryResource,
  MinistryOnboardingTemplate,
  MinistryScale,
  MinistryScaleAssignment,
  MinistryScalePosition,
  MinistryTeamMember,
  MinistryWorkspaceData,
  MinistryWorkspace,
} from "./types"

function iso(value: Date | string | null) {
  return value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null
}

function number(value: unknown) {
  return Number(value ?? 0)
}

function toProfile(row: Record<string, unknown>): MinistryProfile {
  return {
    id: String(row.id), companyId: String(row.company_id), name: String(row.name ?? ""),
    ministryType: row.ministry_type as MinistryProfile["ministryType"], mission: String(row.mission ?? ""),
    description: String(row.description ?? ""), targetAudience: String(row.target_audience ?? ""),
    contact: String(row.contact ?? ""), leaderPersonId: row.leader_person_id ? String(row.leader_person_id) : null,
    leaderName: row.leader_name ? String(row.leader_name) : null, meetingDay: row.meeting_day === null ? null : number(row.meeting_day),
    meetingTime: row.meeting_time ? String(row.meeting_time) : null, meetingLocation: String(row.meeting_location ?? ""),
    imageFileId: row.image_file_id ? String(row.image_file_id) : null, publicJoinEnabled: Boolean(row.public_join_enabled),
    isActive: Boolean(row.is_active), createdAt: iso(row.created_at as Date | string) ?? "", updatedAt: iso(row.updated_at as Date | string) ?? "",
  }
}

function toActivity(row: Record<string, unknown>): MinistryActivity {
  const positions = number(row.volunteer_positions)
  const assigned = number(row.assigned_volunteers)
  return {
    id: String(row.id), title: String(row.title ?? ""), description: String(row.description ?? ""),
    startsAt: iso(row.starts_at as Date | string) ?? "", endsAt: iso(row.ends_at as Date | string | null),
    location: String(row.location ?? ""), status: String(row.status ?? ""), recurring: Boolean(row.recurring),
    attendanceCount: number(row.attendance_count), volunteerPositions: positions, assignedVolunteers: assigned,
    scaleComplete: positions === 0 || assigned >= positions,
  }
}

function mapScaleRows(rows: Record<string, unknown>[]): MinistryScale[] {
  const scales = new Map<string, MinistryScale>()
  const positions = new Map<string, MinistryScalePosition>()

  for (const row of rows) {
    const eventId = String(row.event_id)
    const scale = scales.get(eventId) ?? {
      eventId,
      eventTitle: String(row.event_title ?? "Atividade"),
      startsAt: iso(row.event_starts_at as Date | string) ?? "",
      scheduleId: row.schedule_id ? String(row.schedule_id) : null,
      scheduleStatus: row.schedule_status as MinistryScale["scheduleStatus"],
      publishedAt: iso(row.event_published_at as Date | string | null),
      status: "draft" as MinistryScale["status"],
      positions: [],
    }
    scales.set(eventId, scale)

    const positionId = row.position_id ? String(row.position_id) : row.shift_id ? String(row.shift_id) : null
    if (!positionId) continue
    const position = positions.get(`${eventId}:${positionId}`) ?? {
      id: row.position_id ? String(row.position_id) : positionId,
      shiftId: row.shift_id ? String(row.shift_id) : null,
      roleName: String(row.position_role_name ?? row.shift_role_name ?? "Função"),
      requiredVolunteers: Number(row.position_required ?? row.shift_required ?? 1),
      assignedVolunteers: 0,
      missingVolunteers: 0,
      instructions: String(row.position_instructions ?? ""),
      assignments: [],
    }
    if (row.assignment_id) {
      const assignment: MinistryScaleAssignment = {
        id: String(row.assignment_id),
        personId: String(row.assignment_person_id),
        personName: String(row.assignment_person_name ?? "Pessoa"),
        volunteerId: String(row.assignment_volunteer_id),
        status: String(row.assignment_status ?? "proposed"),
      }
      if (!position.assignments.some((item) => item.id === assignment.id)) position.assignments.push(assignment)
    }
    positions.set(`${eventId}:${positionId}`, position)
  }

  for (const scale of scales.values()) {
    scale.positions = [...positions.entries()]
      .filter(([key]) => key.startsWith(`${scale.eventId}:`))
      .map(([, position]) => {
        position.assignedVolunteers = position.assignments.filter((assignment) => !["declined", "cancelled"].includes(assignment.status)).length
        position.missingVolunteers = Math.max(0, position.requiredVolunteers - position.assignedVolunteers)
        return position
      })
      .sort((a, b) => a.roleName.localeCompare(b.roleName, "pt-BR"))
    const isPublished = Boolean(scale.publishedAt)
    const hasPositions = scale.positions.length > 0
    const complete = hasPositions && scale.positions.every((position) => position.missingVolunteers === 0)
    scale.status = isPublished ? "published" : !hasPositions ? "draft" : complete ? "ready" : "incomplete"
  }
  return [...scales.values()]
}

async function getProfileRow(companyId: string, ministryId: string) {
  const sql = getSql()
  const rows = await sql<Record<string, unknown>[]>`
    select ministry.id, ministry.company_id, ministry.name, ministry.ministry_type, ministry.mission,
      ministry.description, ministry.target_audience, ministry.contact, ministry.leader_person_id,
      leader.full_name as leader_name, ministry.meeting_day, ministry.meeting_time::text as meeting_time,
      ministry.meeting_location, ministry.image_file_id, ministry.public_join_enabled, ministry.is_active,
      ministry.created_at, ministry.updated_at
    from public.ministries ministry
    left join public.people leader on leader.id = ministry.leader_person_id
    where ministry.id = ${ministryId} and ministry.company_id = ${companyId} and ministry.deleted_at is null
    limit 1
  `
  if (!rows[0]) throw new Error("Ministério não encontrado")
  return toProfile(rows[0])
}

export async function getMinistryWorkspaceData(ministryId: string, companyIdInput?: string | null): Promise<MinistryWorkspaceData> {
  const access = await requireMinistryPermission(ministryId, "ministries.dashboard.view", companyIdInput)
  const sql = getSql()
  const [profile, indicators, activityRows, attendanceRows, attendanceRecordRows, members, teams, teamMemberRows, scaleRows, followUps, onboarding, onboardingTemplateRows, resources, report, people, leaderCandidates, responsibleCandidates, communications, lastCommunication] = await Promise.all([
    getProfileRow(access.companyId, ministryId),
    sql<{ active_members: number; pending_members: number; inactive_members: number; active_teams: number; open_team_slots: number; upcoming_activities: number; attendance_present: number; attendance_absent: number; incomplete_scales: number; open_followups: number; overdue_followups: number }[]>`
      select
        (select count(*) from public.ministry_memberships m where m.company_id = ${access.companyId} and m.ministry_id = ${ministryId} and m.status = 'active' and m.left_at is null) as active_members,
        (select count(*) from public.ministry_memberships m where m.company_id = ${access.companyId} and m.ministry_id = ${ministryId} and m.status = 'pending') as pending_members,
        (select count(*) from public.ministry_memberships m where m.company_id = ${access.companyId} and m.ministry_id = ${ministryId} and m.status in ('inactive','rejected')) as inactive_members,
        (select count(*) from public.groups g where g.company_id = ${access.companyId} and g.ministry_id = ${ministryId} and g.type = 'ministry' and g.is_active and g.deleted_at is null) as active_teams,
        (select coalesce(sum(greatest(g.max_capacity - (select count(*) from public.group_members gm where gm.group_id = g.id and gm.status = 'active'), 0)), 0) from public.groups g where g.company_id = ${access.companyId} and g.ministry_id = ${ministryId} and g.type = 'ministry' and g.is_active and g.deleted_at is null) as open_team_slots,
        (select count(*) from public.events e where e.company_id = ${access.companyId} and e.ministry_id = ${ministryId} and e.deleted_at is null and e.starts_at >= now() - interval '1 day' and e.status <> 'cancelled') as upcoming_activities,
        (select count(*) from public.attendance_records a where a.company_id = ${access.companyId} and a.event_type = 'ministry' and a.status = 'present' and a.deleted_at is null and a.occurred_on >= current_date - 30 and exists (select 1 from public.events e where e.id = a.event_ref_id and e.ministry_id = ${ministryId})) as attendance_present,
        (select count(*) from public.attendance_records a where a.company_id = ${access.companyId} and a.event_type = 'ministry' and a.status = 'absent' and a.deleted_at is null and a.occurred_on >= current_date - 30 and exists (select 1 from public.events e where e.id = a.event_ref_id and e.ministry_id = ${ministryId})) as attendance_absent,
        (select count(*) from public.events e where e.company_id = ${access.companyId} and e.ministry_id = ${ministryId} and e.deleted_at is null and e.starts_at >= now() - interval '1 day' and e.status <> 'cancelled' and exists (select 1 from public.volunteer_event_positions p where p.event_id = e.id) and exists (select 1 from public.volunteer_event_positions p where p.event_id = e.id and (select count(*) from public.volunteer_assignments a join public.volunteer_shifts s on s.id = a.shift_id where s.event_id = e.id and a.status not in ('cancelled','declined')) < p.required_volunteers)) as incomplete_scales,
        (select count(*) from public.person_follow_up_tasks t where t.company_id = ${access.companyId} and t.ministry_id = ${ministryId} and t.deleted_at is null and t.status in ('open','in_progress')) as open_followups,
        (select count(*) from public.person_follow_up_tasks t where t.company_id = ${access.companyId} and t.ministry_id = ${ministryId} and t.deleted_at is null and t.status in ('open','in_progress') and t.due_at < now()) as overdue_followups
    `,
    sql<Record<string, unknown>[]>`
      select e.id, e.title, e.description, e.starts_at, e.ends_at, e.location, e.status, e.recurring,
        (select count(*) from public.attendance_records a where a.event_ref_id = e.id and a.event_type = 'ministry' and a.status = 'present' and a.deleted_at is null) as attendance_count,
        (select coalesce(sum(p.required_volunteers), 0) from public.volunteer_event_positions p where p.event_id = e.id) as volunteer_positions,
        (select count(*) from public.volunteer_assignments a join public.volunteer_shifts s on s.id = a.shift_id where s.event_id = e.id and a.status not in ('cancelled','declined')) as assigned_volunteers
      from public.events e
      where e.company_id = ${access.companyId} and e.ministry_id = ${ministryId} and e.deleted_at is null
        and e.starts_at >= now() - interval '1 day' and e.status <> 'cancelled'
      order by e.starts_at asc limit 20
    `,
    sql<{ day: Date | string; present: number; absent: number; justified: number }[]>`
      select a.occurred_on as day,
        count(*) filter (where a.status = 'present') as present,
        count(*) filter (where a.status = 'absent') as absent,
        count(*) filter (where a.status = 'justified') as justified
      from public.attendance_records a
      where a.company_id = ${access.companyId} and a.event_type = 'ministry' and a.deleted_at is null
        and a.occurred_on >= current_date - 30
        and exists (select 1 from public.events e where e.id = a.event_ref_id and e.ministry_id = ${ministryId})
      group by a.occurred_on order by a.occurred_on
    `,
    sql<Record<string, unknown>[]>`
      select a.id, a.event_ref_id as event_id, e.title as event_title, a.person_id, a.person_name, a.occurred_on::text as occurred_on, a.status
      from public.attendance_records a
      join public.events e on e.id = a.event_ref_id
        and e.company_id = ${access.companyId}
        and e.ministry_id = ${ministryId}
        and e.deleted_at is null
      where a.company_id = ${access.companyId}
        and a.event_type = 'ministry'
        and a.deleted_at is null
      order by a.occurred_on desc, e.starts_at desc, a.person_name
      limit 200
    `,
    sql<Record<string, unknown>[]>`
      select membership.id, membership.person_id, person.full_name as person_name, coalesce(person.email, '') as email, person.phone,
        membership.role, membership.status, membership.joined_at, membership.left_at,
        array_remove(array_agg(distinct team.name) filter (where team.id is not null), null) as team_names,
        exists (select 1 from public.profiles profile where profile.person_id = membership.person_id and profile.active) as has_portal
      from public.ministry_memberships membership
      join public.people person on person.id = membership.person_id and person.company_id = ${access.companyId} and person.deleted_at is null
      left join public.group_members gm on gm.person_id = membership.person_id and gm.company_id = ${access.companyId} and gm.status = 'active'
      left join public.groups team on team.id = gm.group_id and team.ministry_id = ${ministryId} and team.type = 'ministry' and team.deleted_at is null
      where membership.company_id = ${access.companyId} and membership.ministry_id = ${ministryId}
      group by membership.id, person.id
      order by case membership.status when 'pending' then 1 when 'active' then 2 else 3 end, person.full_name
      limit 1000
    `,
    sql<Record<string, unknown>[]>`
      select g.id, g.name, g.description, g.leader_person_id, leader.full_name as leader_name,
        g.co_leader_person_id, co_leader.full_name as co_leader_name, g.coordinator_person_id, coordinator.full_name as coordinator_name,
        g.meeting_day, g.meeting_time::text as meeting_time, g.meeting_location, g.max_capacity,
        count(gm.id) filter (where gm.status = 'active') as member_count, g.is_active
      from public.groups g
      left join public.people leader on leader.id = g.leader_person_id
      left join public.people co_leader on co_leader.id = g.co_leader_person_id
      left join public.people coordinator on coordinator.id = g.coordinator_person_id
      left join public.group_members gm on gm.group_id = g.id
      where g.company_id = ${access.companyId} and g.ministry_id = ${ministryId} and g.type = 'ministry' and g.deleted_at is null
      group by g.id, leader.full_name, co_leader.full_name, coordinator.full_name
      order by g.is_active desc, g.name
    `,
    sql<Record<string, unknown>[]>`
      select gm.id, gm.group_id, gm.person_id, person.full_name as person_name, gm.role
      from public.group_members gm
      join public.groups team on team.id = gm.group_id
        and team.company_id = ${access.companyId}
        and team.ministry_id = ${ministryId}
        and team.type = 'ministry'
        and team.deleted_at is null
      join public.people person on person.id = gm.person_id
        and person.company_id = ${access.companyId}
        and person.deleted_at is null
      where gm.company_id = ${access.companyId} and gm.status = 'active'
      order by team.name, person.full_name
    `,
    sql<Record<string, unknown>[]>`
      select event.id as event_id, event.title as event_title, event.starts_at as event_starts_at,
        event.volunteer_schedule_published_at as event_published_at,
        schedule.id as schedule_id, schedule.status as schedule_status,
        position.id as position_id, position.role_name as position_role_name,
        position.required_volunteers as position_required, position.instructions as position_instructions,
        shift.id as shift_id, shift.role_name as shift_role_name, shift.required_volunteers as shift_required,
        assignment.id as assignment_id, assigned_volunteer.person_id as assignment_person_id,
        assignment.volunteer_id as assignment_volunteer_id, assignment.status as assignment_status,
        assigned_person.full_name as assignment_person_name
      from public.events event
      left join public.volunteer_event_positions position
        on position.event_id = event.id and position.company_id = ${access.companyId}
      left join public.volunteer_shifts shift
        on shift.event_id = event.id and shift.company_id = ${access.companyId}
        and (shift.event_position_id = position.id or (position.id is null and shift.event_position_id is null))
      left join public.volunteer_schedules schedule on schedule.id = shift.schedule_id and schedule.company_id = ${access.companyId}
      left join public.volunteer_assignments assignment
        on assignment.shift_id = shift.id and assignment.company_id = ${access.companyId}
      left join public.volunteer_profiles assigned_volunteer on assigned_volunteer.id = assignment.volunteer_id
      left join public.people assigned_person on assigned_person.id = assigned_volunteer.person_id
      where event.company_id = ${access.companyId} and event.ministry_id = ${ministryId}
        and event.deleted_at is null and event.starts_at >= now() - interval '1 day'
      order by event.starts_at, position.sort_order, position.role_name, assigned_person.full_name
    `,
    sql<Record<string, unknown>[]>`
      select task.id, task.person_id, person.full_name as person_name, task.title, task.notes, task.due_at, task.priority, task.status, task.origin,
        task.responsible_profile_id, responsible.name as responsible_name
      from public.person_follow_up_tasks task
      join public.people person on person.id = task.person_id and person.company_id = ${access.companyId}
      left join public.profiles responsible on responsible.id = task.responsible_profile_id
      where task.company_id = ${access.companyId} and task.ministry_id = ${ministryId} and task.deleted_at is null
      order by task.status = 'completed', task.due_at nulls last, task.created_at desc limit 500
    `,
    sql<Record<string, unknown>[]>`
      select membership.id as membership_id, membership.person_id, person.full_name as person_name,
        template.id as template_id, template.name as template_name,
        count(step.id) filter (where step.deleted_at is null) as total,
        count(onboarding.id) filter (where onboarding.completed_at is not null) as completed
      from public.ministry_memberships membership
      join public.people person on person.id = membership.person_id
      left join public.ministry_onboarding_templates template on template.ministry_id = ${ministryId} and template.company_id = ${access.companyId} and template.is_active and template.deleted_at is null
      left join public.ministry_onboarding_steps step on step.template_id = template.id and step.deleted_at is null
      left join public.ministry_member_onboarding onboarding on onboarding.membership_id = membership.id and onboarding.step_id = step.id
      where membership.company_id = ${access.companyId} and membership.ministry_id = ${ministryId} and membership.status = 'active'
      group by membership.id, person.id, template.id
      order by person.full_name limit 500
    `,
    sql<Record<string, unknown>[]>`
      select template.id as template_id, template.name as template_name, template.description as template_description,
        template.is_active as template_is_active, step.id as step_id, step.title as step_title,
        step.description as step_description, step.sort_order, step.is_required
      from public.ministry_onboarding_templates template
      left join public.ministry_onboarding_steps step on step.template_id = template.id and step.deleted_at is null
      where template.company_id = ${access.companyId} and template.ministry_id = ${ministryId} and template.deleted_at is null
      order by template.is_active desc, template.name, step.sort_order, step.title
    `,
    sql<Record<string, unknown>[]>`
      select resource.id, resource.title, resource.description, resource.category, resource.file_id,
        resource.external_url, resource.visibility, resource.sort_order,
        file.original_name as file_name, file.storage_path as file_storage_path
      from public.ministry_resources resource
      left join public.app_files file on file.id = resource.file_id and file.is_active and file.deleted_at is null
      where resource.company_id = ${access.companyId} and resource.ministry_id = ${ministryId} and resource.deleted_at is null
        and (resource.visibility in ('members','public') or ${access.canManage})
      order by resource.sort_order, resource.title
    `,
    getMinistryReportRows(access.companyId, ministryId),
    sql<{ id: string; full_name: string; email: string; phone: string; membership_status: string | null; membership_role: string | null }[]>`
      select person.id, person.full_name, coalesce(person.email, '') as email, person.phone,
        membership.status as membership_status, membership.role as membership_role
      from public.people person
      left join public.ministry_memberships membership
        on membership.person_id = person.id and membership.ministry_id = ${ministryId}
        and membership.company_id = ${access.companyId}
      where person.company_id = ${access.companyId} and person.deleted_at is null and person.is_active
      order by person.full_name limit 1000
    `,
    sql<{ id: string; full_name: string }[]>`
      select id, full_name from public.people where company_id = ${access.companyId} and deleted_at is null and is_active order by full_name limit 1000
    `,
    sql<{ id: string; full_name: string }[]>`
      select person.id, person.full_name
      from public.people person
      join public.profiles profile on profile.person_id = person.id
      where person.company_id = ${access.companyId} and person.deleted_at is null and person.is_active
        and profile.company_id = ${access.companyId} and profile.active
        and profile.role in ('superadmin', 'admin', 'pastor', 'ministry_leader', 'volunteer')
      order by person.full_name limit 500
    `,
    sql<{ id: string; title: string; status: string; method: string; audience_kind: string; snapshot_count: number; created_at: Date | string }[]>`
      select id, title, status, method, audience_kind, snapshot_count, created_at
      from public.notifications
      where company_id = ${access.companyId} and ministry_id = ${ministryId} and deleted_at is null
      order by created_at desc limit 100
    `,
    sql<{ id: string; title: string; status: string; created_at: Date | string }[]>`
      select id, title, status, created_at from public.notifications
      where company_id = ${access.companyId} and ministry_id = ${ministryId} and deleted_at is null
      order by created_at desc limit 1
    `,
  ])

  const indicator = indicators[0]
  const mappedMembers = members.map((row) => ({
    id: String(row.id), personId: String(row.person_id), personName: String(row.person_name), email: String(row.email ?? ""), phone: String(row.phone ?? ""),
    role: row.role as MinistryMember["role"], status: row.status as MinistryMember["status"], joinedAt: iso(row.joined_at as Date | string | null), leftAt: iso(row.left_at as Date | string | null),
    teamNames: Array.isArray(row.team_names) ? row.team_names.map(String) : [], hasPortal: Boolean(row.has_portal),
  }))
  const mappedTeams = teams.map((row) => ({
    id: String(row.id), name: String(row.name), description: String(row.description ?? ""), leaderPersonId: row.leader_person_id ? String(row.leader_person_id) : null,
    leaderName: row.leader_name ? String(row.leader_name) : null, coLeaderPersonId: row.co_leader_person_id ? String(row.co_leader_person_id) : null,
    coLeaderName: row.co_leader_name ? String(row.co_leader_name) : null, coordinatorPersonId: row.coordinator_person_id ? String(row.coordinator_person_id) : null,
    coordinatorName: row.coordinator_name ? String(row.coordinator_name) : null, meetingDay: String(row.meeting_day ?? ""), meetingTime: row.meeting_time ? String(row.meeting_time) : null,
    meetingLocation: String(row.meeting_location ?? ""), maxCapacity: number(row.max_capacity), memberCount: number(row.member_count),
    openSlots: Math.max(0, number(row.max_capacity) - number(row.member_count)), isActive: Boolean(row.is_active),
  }))
  const mappedTeamMembers: MinistryTeamMember[] = teamMemberRows.map((row) => ({
    id: String(row.id), groupId: String(row.group_id), personId: String(row.person_id),
    personName: String(row.person_name ?? "Pessoa"), role: row.role as MinistryTeamMember["role"],
  }))
  const mappedFollowUps = followUps.map((row) => ({
    id: String(row.id), personId: String(row.person_id), personName: String(row.person_name), title: String(row.title), notes: String(row.notes ?? ""),
    dueAt: iso(row.due_at as Date | string | null), priority: String(row.priority), status: String(row.status), origin: String(row.origin),
    responsibleProfileId: row.responsible_profile_id ? String(row.responsible_profile_id) : null, responsibleName: row.responsible_name ? String(row.responsible_name) : null,
  }))
  const mappedCommunications: MinistryCommunication[] = communications.map((row) => ({
    id: String(row.id), title: String(row.title), status: String(row.status), method: String(row.method),
    audienceKind: String(row.audience_kind), snapshotCount: number(row.snapshot_count), createdAt: iso(row.created_at) ?? "",
  }))
  const mappedAttendanceRecords: MinistryAttendanceRecord[] = attendanceRecordRows.map((row) => ({
    id: String(row.id), eventId: String(row.event_id), eventTitle: String(row.event_title ?? "Atividade"),
    personId: row.person_id ? String(row.person_id) : null, personName: String(row.person_name ?? "Pessoa"),
    occurredOn: String(row.occurred_on ?? ""), status: String(row.status ?? ""),
  }))
  const mappedOnboarding = onboarding.map((row) => {
    const total = number(row.total); const completed = number(row.completed)
    return { membershipId: String(row.membership_id), personId: String(row.person_id), personName: String(row.person_name), templateId: row.template_id ? String(row.template_id) : null, templateName: row.template_name ? String(row.template_name) : null, completed, total, percent: total ? Math.round(completed / total * 100) : 0 }
  })
  const onboardingTemplates = new Map<string, MinistryOnboardingTemplate>()
  for (const row of onboardingTemplateRows) {
    const templateId = String(row.template_id)
    const template = onboardingTemplates.get(templateId) ?? {
      id: templateId,
      name: String(row.template_name ?? "Checklist"),
      description: String(row.template_description ?? ""),
      isActive: Boolean(row.template_is_active),
      steps: [],
    }
    if (row.step_id) template.steps.push({
      id: String(row.step_id), title: String(row.step_title ?? ""), description: String(row.step_description ?? ""),
      sortOrder: number(row.sort_order), isRequired: Boolean(row.is_required),
    })
    onboardingTemplates.set(templateId, template)
  }
  const resourceUrls = await createSignedUrlsByStoragePath(resources.map((row) => String(row.file_storage_path ?? "")).filter(Boolean))
  const mappedActivities = activityRows.map(toActivity)
  const mappedScales = mapScaleRows(scaleRows)
  const alerts = [
    { kind: "leader_missing" as const, label: "Ministério sem líder principal", count: profile.leaderPersonId ? 0 : 1, href: "#configuracoes" },
    { kind: "team_without_leader" as const, label: "Equipe sem responsável", count: mappedTeams.filter((team) => team.isActive && !team.leaderPersonId).length, href: "#equipes" },
    { kind: "activity_without_scale" as const, label: "Atividade com escala incompleta", count: mappedActivities.filter((activity) => !activity.scaleComplete && activity.volunteerPositions > 0).length, href: "#agenda" },
    { kind: "follow_up_overdue" as const, label: "Acompanhamentos vencidos", count: number(indicator?.overdue_followups), href: "#acompanhamentos" },
  ].filter((alert) => alert.count > 0)
  const workspace: MinistryWorkspace = {
    profile, actorRole: access.user.role, canManage: access.canManage,
    indicators: {
      activeMembers: number(indicator?.active_members), pendingMembers: number(indicator?.pending_members), inactiveMembers: number(indicator?.inactive_members), activeTeams: number(indicator?.active_teams), openTeamSlots: number(indicator?.open_team_slots), upcomingActivities: number(indicator?.upcoming_activities), attendancePresent30d: number(indicator?.attendance_present), attendanceAbsent30d: number(indicator?.attendance_absent), incompleteScales: number(indicator?.incomplete_scales), openFollowUps: number(indicator?.open_followups), overdueFollowUps: number(indicator?.overdue_followups),
    },
    activities: mappedActivities, attendance: attendanceRows.map((row) => ({ day: iso(row.day) ?? String(row.day), present: number(row.present), absent: number(row.absent), justified: number(row.justified) })), alerts,
    lastCommunication: lastCommunication[0] ? { id: lastCommunication[0].id, title: lastCommunication[0].title, status: lastCommunication[0].status, createdAt: iso(lastCommunication[0].created_at) ?? "" } : null,
  }
  return {
    workspace,
    members: mappedMembers,
    teams: mappedTeams,
    teamMembers: mappedTeamMembers,
    agenda: mappedActivities,
    attendanceRecords: mappedAttendanceRecords,
    scales: mappedScales,
    followUps: mappedFollowUps,
    onboarding: mappedOnboarding,
    onboardingTemplates: [...onboardingTemplates.values()],
    communications: mappedCommunications,
    resources: resources.map((row) => ({
      id: String(row.id), title: String(row.title), description: String(row.description ?? ""),
      category: String(row.category ?? "geral"), fileId: row.file_id ? String(row.file_id) : null,
      fileName: row.file_name ? String(row.file_name) : null,
      fileUrl: row.file_storage_path ? resourceUrls.get(String(row.file_storage_path)) ?? null : null,
      externalUrl: row.external_url ? String(row.external_url) : null,
      visibility: row.visibility as MinistryResource["visibility"], sortOrder: number(row.sort_order),
    })),
    report,
    people: people.map((row) => ({
      id: row.id, fullName: row.full_name, email: row.email, phone: String(row.phone ?? ""),
      membershipStatus: row.membership_status as MinistryAvailablePerson["membershipStatus"],
      membershipRole: row.membership_role as MinistryAvailablePerson["membershipRole"],
    })),
    leaderCandidates: leaderCandidates.map((row) => ({ id: row.id, fullName: row.full_name })),
    responsibleCandidates: responsibleCandidates.map((row) => ({ id: row.id, fullName: row.full_name })),
  }
}

async function getMinistryReportRows(companyId: string, ministryId: string): Promise<MinistryReport> {
  const sql = getSql()
  const [status, months, attendance, teams, hours, scales, followUps, communication, retention] = await Promise.all([
    sql<{ status: string; total: number }[]>`select status, count(*) as total from public.ministry_memberships where company_id = ${companyId} and ministry_id = ${ministryId} group by status order by status`,
    sql<{ month: string; total: number }[]>`select to_char(date_trunc('month', coalesce(joined_at, requested_at)), 'YYYY-MM') as month, count(*) as total from public.ministry_memberships where company_id = ${companyId} and ministry_id = ${ministryId} group by 1 order by 1 desc limit 24`,
    sql<{ status: string; total: number }[]>`select a.status, count(*) as total from public.attendance_records a where a.company_id = ${companyId} and a.event_type = 'ministry' and a.deleted_at is null and exists (select 1 from public.events e where e.id = a.event_ref_id and e.ministry_id = ${ministryId}) group by a.status`,
    sql<{ team_id: string; team_name: string; total: number }[]>`select g.id as team_id, g.name as team_name, count(*) filter (where gm.status = 'active') as total from public.groups g left join public.group_members gm on gm.group_id = g.id where g.company_id = ${companyId} and g.ministry_id = ${ministryId} and g.type = 'ministry' and g.deleted_at is null group by g.id order by g.name`,
    sql<{ total: number }[]>`select coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600), 0) as total from public.volunteer_shifts s join public.events e on e.id = s.event_id where s.company_id = ${companyId} and e.ministry_id = ${ministryId} and s.ends_at is not null`,
    sql<{ total: number }[]>`select count(*) from public.events e where e.company_id = ${companyId} and e.ministry_id = ${ministryId} and e.deleted_at is null and e.volunteer_schedule_published_at is not null`,
    sql<{ status: string; total: number }[]>`select status, count(*) as total from public.person_follow_up_tasks where company_id = ${companyId} and ministry_id = ${ministryId} and deleted_at is null group by status`,
    sql<{ status: string; total: number }[]>`select status, count(*) as total from public.notifications where company_id = ${companyId} and audience_kind = 'ministry' and audience_ref_id = ${ministryId} and deleted_at is null group by status`,
    sql<{ active_at_30d: number; current_active: number }[]>`select count(*) filter (where status = 'active' and left_at is null and coalesce(joined_at, requested_at) <= now() - interval '30 days') as active_at_30d, count(*) filter (where status = 'active' and left_at is null) as current_active from public.ministry_memberships where company_id = ${companyId} and ministry_id = ${ministryId}`,
  ])
  const get = (rows: { total: number }[]) => number(rows[0]?.total)
  const currentActive = number(retention[0]?.current_active)
  const activeAt30d = number(retention[0]?.active_at_30d)
  return { membersByStatus: status.map((row) => ({ status: row.status, total: number(row.total) })), membersByMonth: months.map((row) => ({ month: row.month, total: number(row.total) })), attendance: attendance.map((row) => ({ status: row.status, total: number(row.total) })), teamParticipation: teams.map((row) => ({ teamId: row.team_id, teamName: row.team_name, total: number(row.total) })), volunteerHours: get(hours), filledScales: get(scales), openFollowUps: number(followUps.filter((row) => row.status === "open" || row.status === "in_progress").reduce((sum, row) => sum + number(row.total), 0)), completedFollowUps: number(followUps.filter((row) => row.status === "completed").reduce((sum, row) => sum + number(row.total), 0)), communication: communication.map((row) => ({ status: row.status, total: number(row.total) })), retention: { activeAt30d, currentActive, rate: currentActive ? Math.round(activeAt30d / currentActive * 100) : 0 } }
}

export async function getMinistryReport(ministryId: string, companyIdInput?: string | null) {
  const access = await requireMinistryPermission(ministryId, "ministries.reports.view", companyIdInput)
  return getMinistryReportRows(access.companyId, ministryId)
}

export async function listMinistryMembers(ministryId: string, companyIdInput?: string | null, search = "") {
  const data = await getMinistryWorkspaceData(ministryId, companyIdInput)
  const normalized = search.trim().toLocaleLowerCase("pt-BR")
  return normalized ? data.members.filter((member) => `${member.personName} ${member.email} ${member.phone}`.toLocaleLowerCase("pt-BR").includes(normalized)) : data.members
}
