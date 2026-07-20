import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import type {
  VolunteerAssignment,
  VolunteerDashboardData,
  VolunteerDepartment,
  VolunteerFeedPost,
  VolunteerListItem,
  VolunteerPortalData,
  VolunteerProgramming,
  VolunteerSchedule,
  VolunteerShift,
  VolunteerTemplate,
} from "./types"
import { getVolunteerV2DashboardExtras, getVolunteerV2PortalExtras } from "./v2-data"
import { requireVolunteerSelfContext } from "./access"

type DateValue = Date | string | null

function iso(value: DateValue) {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

async function companyId(input?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  return requireUserCompanyId(user, input)
}

function toVolunteer(row: Record<string, unknown>): VolunteerListItem {
  return {
    id: String(row.id),
    personId: String(row.person_id),
    profileId: row.profile_id ? String(row.profile_id) : null,
    name: String(row.name),
    email: row.email ? String(row.email) : null,
    phone: String(row.phone ?? ""),
    status: row.registration_status as VolunteerListItem["status"],
    active: Boolean(row.is_active),
    whatsappEnabled: Boolean(row.whatsapp_enabled),
    emailEnabled: Boolean(row.email_enabled),
    departmentNames: String(row.department_names ?? "")
      .split("|")
      .filter(Boolean),
    assignments: Number(row.assignments ?? 0),
    checkins: Number(row.checkins ?? 0),
    lastParticipationAt: iso(row.last_participation_at as DateValue),
    desiredServicesPerMonth: Number(row.desired_services_per_month ?? 2),
    maxServicesPerMonth: Number(row.max_services_per_month ?? 4),
    minimumRestHours: Number(row.minimum_rest_hours ?? 12),
    validatedAt: iso(row.validated_at as DateValue),
  }
}

function toDepartment(row: Record<string, unknown>): VolunteerDepartment {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    managerProfileId: row.manager_profile_id ? String(row.manager_profile_id) : null,
    active: Boolean(row.is_active),
  }
}

function toFeedPost(row: Record<string, unknown>): VolunteerFeedPost {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    status: row.status as VolunteerFeedPost["status"],
    audience: row.audience as VolunteerFeedPost["audience"],
    departmentIds: String(row.department_ids ?? "").split("|").filter(Boolean),
    publishedAt: iso(row.published_at as DateValue),
    createdAt: iso(row.created_at as DateValue) ?? "",
    unread: row.unread === undefined ? undefined : Boolean(row.unread),
  }
}

export async function getVolunteerDashboardData(companyIdInput?: string | null): Promise<VolunteerDashboardData> {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("volunteers.view", resolvedCompanyId)
  const sql = getSql()
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const allDepartments = user.role === "superadmin" || user.role === "admin" || user.role === "pastor"
  const accessRows = allDepartments ? [] : await sql<{ department_id: string }[]>`
    select department_id from public.volunteer_department_access
    where company_id = ${resolvedCompanyId} and profile_id = ${user.id}
  `
  const departmentScope = accessRows.map((row) => row.department_id)
  if (!allDepartments && departmentScope.length === 0) throw new Error("Acesso negado")

  const [volunteerRows, departmentRows, templateRows, slotRows, scheduleRows, shiftRows, assignmentRows, feedRows, metricRows, programmingRows, occurrenceRows] = await Promise.all([
    sql<Record<string, unknown>[]>`
      select vp.id, vp.person_id, profile.id as profile_id, person.full_name as name, person.email, person.phone,
             vp.registration_status, person.is_active, vp.whatsapp_enabled, vp.email_enabled,
             vp.desired_services_per_month, vp.max_services_per_month, vp.minimum_rest_hours, vp.validated_at,
             coalesce(string_agg(distinct department.name, '|' order by department.name), '') as department_names,
             count(distinct assignment.id) as assignments,
             count(distinct assignment.id) filter (where assignment.checked_in_at is not null) as checkins,
             max(assignment.checked_in_at) as last_participation_at
      from public.volunteer_profiles vp
      join public.people person on person.id = vp.person_id and person.deleted_at is null
      left join public.profiles profile on profile.person_id = person.id and profile.active
      left join public.volunteer_department_memberships membership on membership.volunteer_id = vp.id and membership.is_active
      left join public.volunteer_departments department on department.id = membership.department_id and department.deleted_at is null
      left join public.volunteer_assignments assignment on assignment.volunteer_id = vp.id
      where vp.company_id = ${resolvedCompanyId} and vp.deleted_at is null
        and (${allDepartments} or exists(select 1 from public.volunteer_department_memberships scope_membership
          where scope_membership.volunteer_id = vp.id and scope_membership.is_active
            and scope_membership.department_id = any(${departmentScope}::uuid[])))
      group by vp.id, person.id, profile.id
      order by person.full_name
    `,
    sql<Record<string, unknown>[]>`
      select id, name, description, manager_profile_id, is_active
      from public.volunteer_departments
      where company_id = ${resolvedCompanyId} and deleted_at is null
        and (${allDepartments} or id = any(${departmentScope}::uuid[]))
      order by is_active desc, name
    `,
    sql<Record<string, unknown>[]>`
      select id, name, description, is_active
      from public.volunteer_schedule_templates
      where company_id = ${resolvedCompanyId} and deleted_at is null
        and owner_programming_id is null
        and (${allDepartments} or exists(select 1 from public.volunteer_schedule_template_slots scope_slot
          where scope_slot.template_id = volunteer_schedule_templates.id and scope_slot.department_id = any(${departmentScope}::uuid[])))
      order by is_active desc, name
    `,
    sql<Record<string, unknown>[]>`
      select slot.id, slot.template_id, slot.department_id, department.name as department_name,
             slot.role_id, slot.role_name, slot.required_volunteers, slot.instructions
      from public.volunteer_schedule_template_slots slot
      join public.volunteer_departments department on department.id = slot.department_id
      where slot.company_id = ${resolvedCompanyId}
        and (${allDepartments} or slot.department_id = any(${departmentScope}::uuid[]))
      order by slot.sort_order, slot.role_name
    `,
    sql<Record<string, unknown>[]>`
      select id, month, status, published_at
      from public.volunteer_schedules
      where company_id = ${resolvedCompanyId} and month >= date_trunc('month', now())::date - interval '1 month'
        and (${allDepartments} or exists(select 1 from public.volunteer_shifts scope_shift
          where scope_shift.schedule_id = volunteer_schedules.id and scope_shift.department_id = any(${departmentScope}::uuid[])))
      order by month
      limit 8
    `,
    sql<Record<string, unknown>[]>`
      select shift.id, shift.schedule_id, shift.event_id, coalesce(event.title, 'Escala avulsa') as event_title,
             shift.department_id, department.name as department_name, shift.role_name, shift.required_volunteers,
             shift.starts_at, shift.ends_at, shift.checkin_opens_at, shift.checkin_closes_at, shift.instructions
      from public.volunteer_shifts shift
      join public.volunteer_schedules schedule on schedule.id = shift.schedule_id
      join public.volunteer_departments department on department.id = shift.department_id
      left join public.events event on event.id = shift.event_id
      where shift.company_id = ${resolvedCompanyId} and schedule.month >= date_trunc('month', now())::date - interval '1 month'
        and (${allDepartments} or shift.department_id = any(${departmentScope}::uuid[]))
      order by shift.starts_at, department.name, shift.role_name
    `,
    sql<Record<string, unknown>[]>`
      select assignment.id, assignment.shift_id, assignment.volunteer_id, person.full_name as volunteer_name,
             assignment.status, assignment.checked_in_at, assignment.checked_out_at, assignment.score,
             assignment.score_reasons, assignment.is_locked, assignment.decline_reason
      from public.volunteer_assignments assignment
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
      join public.people person on person.id = volunteer.person_id
      where assignment.company_id = ${resolvedCompanyId}
        and (${allDepartments} or exists(select 1 from public.volunteer_shifts scope_shift
          where scope_shift.id = assignment.shift_id and scope_shift.department_id = any(${departmentScope}::uuid[])))
      order by person.full_name
    `,
    sql<Record<string, unknown>[]>`
      select post.id, post.title, post.content, post.status, post.audience, post.published_at, post.created_at,
             coalesce(string_agg(target.department_id::text, '|'), '') as department_ids
      from public.volunteer_feed_posts post
      left join public.volunteer_feed_post_departments target on target.post_id = post.id
      where post.company_id = ${resolvedCompanyId}
      group by post.id
      order by coalesce(post.published_at, post.created_at) desc
      limit 50
    `,
    sql<Record<string, unknown>[]>`
      select
        count(*) filter (where vp.registration_status = 'active' and person.is_active)::integer as active_volunteers,
        count(distinct assignment.id) filter (where date_trunc('month', shift.starts_at) = date_trunc('month', now()))::integer as assigned_this_month,
        coalesce(sum(shift.required_volunteers - assignment_counts.assigned_count) filter (where date_trunc('month', shift.starts_at) = date_trunc('month', now())), 0)::integer as open_vacancies,
        count(distinct assignment.id) filter (where assignment.checked_in_at >= date_trunc('month', now()))::integer as checkins_this_month,
        count(*) filter (where vp.created_at >= date_trunc('month', now()))::integer as monthly_growth
      from public.volunteer_profiles vp
      join public.people person on person.id = vp.person_id
      left join public.volunteer_assignments assignment on assignment.volunteer_id = vp.id
      left join public.volunteer_shifts shift on shift.id = assignment.shift_id
      left join lateral (
        select count(*)::integer as assigned_count
        from public.volunteer_assignments current_assignment
        where current_assignment.shift_id = shift.id
          and current_assignment.status not in ('declined', 'cancelled')
      ) assignment_counts on true
      where vp.company_id = ${resolvedCompanyId} and vp.deleted_at is null
        and (${allDepartments} or exists(select 1 from public.volunteer_department_memberships scope_membership
          where scope_membership.volunteer_id = vp.id and scope_membership.is_active
            and scope_membership.department_id = any(${departmentScope}::uuid[])))
    `,
    sql<Record<string, unknown>[]>`
      select programming.id, programming.title, programming.description, programming.kind,
             programming.starts_at, programming.duration_minutes, programming.location,
             programming.timezone, programming.recurrence_frequency,
             programming.recurrence_weekdays, programming.recurrence_until,
             programming.recurrence_needs_review, programming.is_active,
             programming.volunteer_template_id
      from public.programmings programming
      where programming.company_id = ${resolvedCompanyId}
        and programming.deleted_at is null
        and (
          ${allDepartments}
          or exists (
            select 1 from public.volunteer_schedule_template_slots scope_slot
            where scope_slot.template_id = programming.volunteer_template_id
              and scope_slot.department_id = any(${departmentScope}::uuid[])
          )
          or exists (
            select 1 from public.events event
            join public.volunteer_event_positions scope_position on scope_position.event_id = event.id
            where event.programming_id = programming.id
              and scope_position.department_id = any(${departmentScope}::uuid[])
          )
        )
      order by programming.is_active desc, programming.starts_at, programming.title
    `,
    sql<Record<string, unknown>[]>`
      select event.id as event_id, event.programming_id, event.starts_at, event.ends_at,
             event.volunteer_schedule_published_at,
             coalesce((
               select sum(position.required_volunteers)::integer
               from public.volunteer_event_positions position
               where position.event_id = event.id
                 and (${allDepartments} or position.department_id = any(${departmentScope}::uuid[]))
             ), 0)::integer as required_volunteers,
             coalesce((
               select count(distinct assignment.id)::integer
               from public.volunteer_shifts shift
               join public.volunteer_assignments assignment on assignment.shift_id = shift.id
               where shift.event_id = event.id
                 and assignment.status not in ('declined', 'cancelled')
                 and (${allDepartments} or shift.department_id = any(${departmentScope}::uuid[]))
             ), 0)::integer as assigned_volunteers
      from public.events event
      where event.company_id = ${resolvedCompanyId}
        and event.programming_id is not null
        and event.deleted_at is null
        and event.starts_at >= date_trunc('month', now()) - interval '1 month'
        and event.starts_at <= now() + interval '100 days'
        and (
          ${allDepartments}
          or exists (
            select 1 from public.volunteer_event_positions scope_position
            where scope_position.event_id = event.id
              and scope_position.department_id = any(${departmentScope}::uuid[])
          )
        )
      order by event.starts_at
    `,
  ])

  const [roleRows, membershipRows] = await Promise.all([
    sql<Record<string, unknown>[]>`
      select id, department_id, name, description, instructions, is_active
      from public.volunteer_department_roles
      where company_id = ${resolvedCompanyId}
        and deleted_at is null
        and (${allDepartments} or department_id = any(${departmentScope}::uuid[]))
      order by name
    `,
    sql<Record<string, unknown>[]>`
      select membership.id, membership.volunteer_id, membership.department_id,
             department.name as department_name, membership.role_id,
             membership.role_name, membership.preferred, membership.is_active
      from public.volunteer_department_memberships membership
      join public.volunteer_departments department on department.id = membership.department_id
      where membership.company_id = ${resolvedCompanyId}
        and membership.is_active
        and (${allDepartments} or membership.department_id = any(${departmentScope}::uuid[]))
      order by department.name, membership.role_name
    `,
  ])

  const rolesByDepartment = new Map<string, VolunteerDepartment["roles"]>()
  for (const row of roleRows) {
    const departmentId = String(row.department_id)
    const current = rolesByDepartment.get(departmentId) ?? []
    current.push({
      id: String(row.id),
      departmentId,
      name: String(row.name),
      description: String(row.description ?? ""),
      instructions: String(row.instructions ?? ""),
      active: Boolean(row.is_active),
    })
    rolesByDepartment.set(departmentId, current)
  }
  const membershipsByVolunteer = new Map<string, VolunteerListItem["memberships"]>()
  for (const row of membershipRows) {
    const volunteerId = String(row.volunteer_id)
    const current = membershipsByVolunteer.get(volunteerId) ?? []
    current.push({
      id: String(row.id),
      departmentId: String(row.department_id),
      departmentName: String(row.department_name),
      roleId: row.role_id ? String(row.role_id) : null,
      roleName: String(row.role_name),
      preferred: Boolean(row.preferred),
      active: Boolean(row.is_active),
    })
    membershipsByVolunteer.set(volunteerId, current)
  }

  const assignmentsByShift = new Map<string, VolunteerAssignment[]>()
  for (const row of assignmentRows) {
    const current = assignmentsByShift.get(String(row.shift_id)) ?? []
    current.push({
      id: String(row.id),
      volunteerId: String(row.volunteer_id),
      volunteerName: String(row.volunteer_name),
      status: row.status as VolunteerAssignment["status"],
      checkedInAt: iso(row.checked_in_at as DateValue),
      checkedOutAt: iso(row.checked_out_at as DateValue),
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      scoreReasons: Array.isArray(row.score_reasons) ? row.score_reasons as VolunteerAssignment["scoreReasons"] : [],
      locked: Boolean(row.is_locked),
      declineReason: row.decline_reason ? String(row.decline_reason) : null,
    })
    assignmentsByShift.set(String(row.shift_id), current)
  }

  const shiftsBySchedule = new Map<string, VolunteerShift[]>()
  for (const row of shiftRows) {
    const shift: VolunteerShift = {
      id: String(row.id),
      eventId: row.event_id ? String(row.event_id) : null,
      eventTitle: String(row.event_title),
      departmentId: String(row.department_id),
      departmentName: String(row.department_name),
      roleName: String(row.role_name),
      requiredVolunteers: Number(row.required_volunteers),
      startsAt: iso(row.starts_at as DateValue) ?? "",
      endsAt: iso(row.ends_at as DateValue),
      checkinOpensAt: iso(row.checkin_opens_at as DateValue) ?? "",
      checkinClosesAt: iso(row.checkin_closes_at as DateValue) ?? "",
      assignments: assignmentsByShift.get(String(row.id)) ?? [],
      instructions: String(row.instructions ?? ""),
    }
    const current = shiftsBySchedule.get(String(row.schedule_id)) ?? []
    current.push(shift)
    shiftsBySchedule.set(String(row.schedule_id), current)
  }

  const slotsByTemplate = new Map<string, VolunteerTemplate["slots"]>()
  for (const row of slotRows) {
    const current = slotsByTemplate.get(String(row.template_id)) ?? []
    current.push({
      id: String(row.id),
      departmentId: String(row.department_id),
      departmentName: String(row.department_name),
      roleId: String(row.role_id),
      roleName: String(row.role_name),
      requiredVolunteers: Number(row.required_volunteers),
      instructions: String(row.instructions ?? ""),
    })
    slotsByTemplate.set(String(row.template_id), current)
  }

  const metrics = metricRows[0] ?? {}
  const extras = await getVolunteerV2DashboardExtras(resolvedCompanyId, departmentScope, allDepartments)
  const occurrencesByProgramming = new Map<string, VolunteerProgramming["occurrences"]>()
  for (const row of occurrenceRows) {
    const programmingId = String(row.programming_id)
    const required = Number(row.required_volunteers ?? 0)
    const assigned = Number(row.assigned_volunteers ?? 0)
    const publishedAt = iso(row.volunteer_schedule_published_at as DateValue)
    const status = publishedAt
      ? "published"
      : required === 0
        ? "no_team"
        : assigned === 0
          ? "draft"
          : assigned < required
            ? "incomplete"
            : "ready"
    const current = occurrencesByProgramming.get(programmingId) ?? []
    current.push({
      eventId: String(row.event_id),
      startsAt: iso(row.starts_at as DateValue) ?? "",
      endsAt: iso(row.ends_at as DateValue),
      schedulePublishedAt: publishedAt,
      requiredVolunteers: required,
      assignedVolunteers: assigned,
      status,
    })
    occurrencesByProgramming.set(programmingId, current)
  }
  return {
    volunteers: volunteerRows.map((row) => ({
      ...toVolunteer(row),
      memberships: membershipsByVolunteer.get(String(row.id)) ?? [],
    })),
    departments: departmentRows.map((row) => ({
      ...toDepartment(row),
      roles: rolesByDepartment.get(String(row.id)) ?? [],
    })),
    templates: templateRows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description ?? ""),
      active: Boolean(row.is_active),
      slots: slotsByTemplate.get(String(row.id)) ?? [],
    })),
    schedules: scheduleRows.map((row): VolunteerSchedule => ({
      id: String(row.id),
      month: iso(row.month as DateValue)?.slice(0, 10) ?? "",
      status: row.status as VolunteerSchedule["status"],
      publishedAt: iso(row.published_at as DateValue),
      shifts: shiftsBySchedule.get(String(row.id)) ?? [],
    })),
    feedPosts: feedRows.map(toFeedPost),
    programmings: programmingRows.map((row): VolunteerProgramming => ({
      id: String(row.id),
      title: String(row.title),
      description: String(row.description ?? ""),
      kind: row.kind as VolunteerProgramming["kind"],
      startsAt: iso(row.starts_at as DateValue),
      durationMinutes: Number(row.duration_minutes ?? 60),
      location: String(row.location ?? ""),
      timezone: String(row.timezone ?? "America/Sao_Paulo"),
      recurrenceFrequency: row.recurrence_frequency as VolunteerProgramming["recurrenceFrequency"],
      recurrenceWeekdays: Array.isArray(row.recurrence_weekdays)
        ? row.recurrence_weekdays.map(Number)
        : [],
      recurrenceUntil: iso(row.recurrence_until as DateValue)?.slice(0, 10) ?? null,
      recurrenceNeedsReview: Boolean(row.recurrence_needs_review),
      active: Boolean(row.is_active),
      templateId: row.volunteer_template_id ? String(row.volunteer_template_id) : null,
      positions: row.volunteer_template_id
        ? slotsByTemplate.get(String(row.volunteer_template_id)) ?? []
        : [],
      occurrences: occurrencesByProgramming.get(String(row.id)) ?? [],
    })),
    ...extras,
    metrics: {
      activeVolunteers: Number(metrics.active_volunteers ?? 0),
      assignedThisMonth: Number(metrics.assigned_this_month ?? 0),
      openVacancies: Number(metrics.open_vacancies ?? 0),
      checkinsThisMonth: Number(metrics.checkins_this_month ?? 0),
      monthlyGrowth: Number(metrics.monthly_growth ?? 0),
    },
  }
}

export async function listVolunteerTemplatesForEvents(companyIdInput?: string | null) {
  const resolvedCompanyId = await companyId(companyIdInput)
  await requirePermission("events.view", resolvedCompanyId)
  return getSql()<{ id: string; name: string }[]>`
    select id, name
    from public.volunteer_schedule_templates
    where company_id = ${resolvedCompanyId} and is_active and deleted_at is null
    order by name
  `
}

export async function getVolunteerPortalData(): Promise<VolunteerPortalData> {
  const { user, companyId, personId, volunteerId } = await requireVolunteerSelfContext()
  const sql = getSql()
  const volunteerRows = await sql<Record<string, unknown>[]>`
    select vp.id, vp.person_id, profile.id as profile_id, person.full_name as name, person.email, person.phone,
           vp.registration_status, person.is_active, vp.whatsapp_enabled, vp.email_enabled,
           vp.desired_services_per_month, vp.max_services_per_month, vp.minimum_rest_hours, vp.validated_at,
           coalesce(string_agg(distinct department.name, '|' order by department.name), '') as department_names,
           count(distinct assignment.id) as assignments,
           count(distinct assignment.id) filter (where assignment.checked_in_at is not null) as checkins,
           max(assignment.checked_in_at) as last_participation_at
    from public.volunteer_profiles vp
    join public.people person on person.id = vp.person_id and person.deleted_at is null
    left join public.profiles profile on profile.id = ${user.id}
    left join public.volunteer_department_memberships membership on membership.volunteer_id = vp.id and membership.is_active
    left join public.volunteer_departments department on department.id = membership.department_id and department.deleted_at is null
    left join public.volunteer_assignments assignment on assignment.volunteer_id = vp.id
    where vp.id = ${volunteerId}
      and vp.person_id = ${personId}
      and vp.company_id = ${companyId}
      and vp.registration_status = 'active'
      and vp.deleted_at is null
    group by vp.id, person.id, profile.id
    limit 1
  `
  const volunteer = volunteerRows[0] as Record<string, unknown> | undefined
  if (!volunteer) throw new Error("Perfil de voluntário não vinculado")

  const portalRows = await Promise.all([
    sql<Record<string, unknown>[]>`
      select shift.id, shift.event_id, coalesce(event.title, 'Escala avulsa') as event_title,
             shift.department_id, department.name as department_name, shift.role_name, shift.required_volunteers,
             shift.starts_at, shift.ends_at, shift.checkin_opens_at, shift.checkin_closes_at, shift.instructions,
             assignment.id as assignment_id, assignment.status as assignment_status, assignment.checked_in_at,
             assignment.checked_out_at, assignment.score, assignment.score_reasons, assignment.is_locked, assignment.decline_reason
      from public.volunteer_assignments assignment
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      join public.volunteer_departments department on department.id = shift.department_id
      left join public.events event on event.id = shift.event_id
       where assignment.volunteer_id = ${volunteerId}
        and assignment.status not in ('declined', 'cancelled')
        and shift.starts_at >= now() - interval '1 day'
      order by shift.starts_at
      limit 40
    `,
    sql<Record<string, unknown>[]>`
      select post.id, post.title, post.content, post.status, post.audience, post.published_at, post.created_at,
             coalesce(string_agg(target.department_id::text, '|'), '') as department_ids,
             read.post_id is null as unread
      from public.volunteer_feed_posts post
      left join public.volunteer_feed_post_departments target on target.post_id = post.id
       left join public.volunteer_feed_reads read on read.post_id = post.id and read.volunteer_id = ${volunteerId}
      where post.company_id = ${companyId}
        and post.status = 'published'
        and (
          post.audience = 'all'
          or exists (
            select 1
            from public.volunteer_feed_post_departments target_match
            join public.volunteer_department_memberships membership on membership.department_id = target_match.department_id
            where target_match.post_id = post.id
              and membership.volunteer_id = ${volunteerId}
              and membership.is_active
          )
        )
      group by post.id, read.post_id
      order by post.published_at desc
      limit 50
    `,
  ])
  const shiftRows = portalRows[0] as Record<string, unknown>[]
  const feedRows = portalRows[1] as Record<string, unknown>[]
  const extras = await getVolunteerV2PortalExtras(companyId, volunteerId)

  return {
    volunteer: toVolunteer(volunteer),
    upcomingAssignments: shiftRows.map((row) => ({
      id: String(row.id),
      eventId: row.event_id ? String(row.event_id) : null,
      eventTitle: String(row.event_title),
      departmentId: String(row.department_id),
      departmentName: String(row.department_name),
      roleName: String(row.role_name),
      requiredVolunteers: Number(row.required_volunteers),
      startsAt: iso(row.starts_at as DateValue) ?? "",
      endsAt: iso(row.ends_at as DateValue),
      checkinOpensAt: iso(row.checkin_opens_at as DateValue) ?? "",
      checkinClosesAt: iso(row.checkin_closes_at as DateValue) ?? "",
      assignments: [{
        id: String(row.assignment_id),
        volunteerId,
        volunteerName: String(volunteer.name),
        status: row.assignment_status as VolunteerAssignment["status"],
        checkedInAt: iso(row.checked_in_at as DateValue),
        checkedOutAt: iso(row.checked_out_at as DateValue),
        score: row.score === null || row.score === undefined ? null : Number(row.score),
        scoreReasons: Array.isArray(row.score_reasons) ? row.score_reasons as VolunteerAssignment["scoreReasons"] : [],
        locked: Boolean(row.is_locked),
        declineReason: row.decline_reason ? String(row.decline_reason) : null,
      }],
      instructions: String(row.instructions ?? ""),
    })),
    feedPosts: feedRows.map(toFeedPost),
    ...extras,
  }
}
