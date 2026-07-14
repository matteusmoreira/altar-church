import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { hasPermission } from "@/lib/types"
import type {
  VolunteerAssignment,
  VolunteerDashboardData,
  VolunteerDepartment,
  VolunteerFeedPost,
  VolunteerListItem,
  VolunteerPortalData,
  VolunteerSchedule,
  VolunteerShift,
  VolunteerTemplate,
} from "./types"

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

  const [volunteerRows, departmentRows, templateRows, slotRows, scheduleRows, shiftRows, assignmentRows, feedRows, metricRows] = await Promise.all([
    sql<Record<string, unknown>[]>`
      select vp.id, vp.person_id, profile.id as profile_id, person.full_name as name, person.email, person.phone,
             vp.registration_status, person.is_active, vp.whatsapp_enabled, vp.email_enabled,
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
      group by vp.id, person.id, profile.id
      order by person.full_name
    `,
    sql<Record<string, unknown>[]>`
      select id, name, description, manager_profile_id, is_active
      from public.volunteer_departments
      where company_id = ${resolvedCompanyId} and deleted_at is null
      order by is_active desc, name
    `,
    sql<Record<string, unknown>[]>`
      select id, name, description, is_active
      from public.volunteer_schedule_templates
      where company_id = ${resolvedCompanyId} and deleted_at is null
      order by is_active desc, name
    `,
    sql<Record<string, unknown>[]>`
      select slot.id, slot.template_id, slot.department_id, department.name as department_name,
             slot.role_name, slot.required_volunteers
      from public.volunteer_schedule_template_slots slot
      join public.volunteer_departments department on department.id = slot.department_id
      where slot.company_id = ${resolvedCompanyId}
      order by slot.sort_order, slot.role_name
    `,
    sql<Record<string, unknown>[]>`
      select id, month, status, published_at
      from public.volunteer_schedules
      where company_id = ${resolvedCompanyId} and month >= date_trunc('month', now())::date - interval '1 month'
      order by month
      limit 8
    `,
    sql<Record<string, unknown>[]>`
      select shift.id, shift.schedule_id, shift.event_id, coalesce(event.title, 'Escala avulsa') as event_title,
             shift.department_id, department.name as department_name, shift.role_name, shift.required_volunteers,
             shift.starts_at, shift.ends_at, shift.checkin_opens_at, shift.checkin_closes_at
      from public.volunteer_shifts shift
      join public.volunteer_schedules schedule on schedule.id = shift.schedule_id
      join public.volunteer_departments department on department.id = shift.department_id
      left join public.events event on event.id = shift.event_id
      where shift.company_id = ${resolvedCompanyId} and schedule.month >= date_trunc('month', now())::date - interval '1 month'
      order by shift.starts_at, department.name, shift.role_name
    `,
    sql<Record<string, unknown>[]>`
      select assignment.id, assignment.shift_id, assignment.volunteer_id, person.full_name as volunteer_name,
             assignment.status, assignment.checked_in_at
      from public.volunteer_assignments assignment
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
      join public.people person on person.id = volunteer.person_id
      where assignment.company_id = ${resolvedCompanyId}
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
    `,
  ])

  const assignmentsByShift = new Map<string, VolunteerAssignment[]>()
  for (const row of assignmentRows) {
    const current = assignmentsByShift.get(String(row.shift_id)) ?? []
    current.push({
      id: String(row.id),
      volunteerId: String(row.volunteer_id),
      volunteerName: String(row.volunteer_name),
      status: row.status as VolunteerAssignment["status"],
      checkedInAt: iso(row.checked_in_at as DateValue),
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
      roleName: String(row.role_name),
      requiredVolunteers: Number(row.required_volunteers),
    })
    slotsByTemplate.set(String(row.template_id), current)
  }

  const metrics = metricRows[0] ?? {}
  return {
    volunteers: volunteerRows.map(toVolunteer),
    departments: departmentRows.map(toDepartment),
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
  const user = await getCurrentUser()
  if (!user || !user.churchId) throw new Error("Acesso negado")
  if (!hasPermission(user.role, "volunteer.self.view")) throw new Error("Acesso negado")
  const sql = getSql()
  const volunteerRows = await sql<Record<string, unknown>[]>`
    select vp.id, vp.person_id, profile.id as profile_id, person.full_name as name, person.email, person.phone,
           vp.registration_status, person.is_active, vp.whatsapp_enabled, vp.email_enabled,
           coalesce(string_agg(distinct department.name, '|' order by department.name), '') as department_names,
           count(distinct assignment.id) as assignments,
           count(distinct assignment.id) filter (where assignment.checked_in_at is not null) as checkins,
           max(assignment.checked_in_at) as last_participation_at
    from public.profiles profile
    join public.volunteer_profiles vp on vp.person_id = profile.person_id and vp.deleted_at is null
    join public.people person on person.id = vp.person_id and person.deleted_at is null
    left join public.volunteer_department_memberships membership on membership.volunteer_id = vp.id and membership.is_active
    left join public.volunteer_departments department on department.id = membership.department_id and department.deleted_at is null
    left join public.volunteer_assignments assignment on assignment.volunteer_id = vp.id
    where profile.id = ${user.id} and vp.company_id = ${user.churchId}
    group by vp.id, person.id, profile.id
    limit 1
  `
  const volunteer = volunteerRows[0] as Record<string, unknown> | undefined
  if (!volunteer) throw new Error("Perfil de voluntário não vinculado")
  const volunteerId = String(volunteer.id)

  const portalRows = await Promise.all([
    sql<Record<string, unknown>[]>`
      select shift.id, shift.event_id, coalesce(event.title, 'Escala avulsa') as event_title,
             shift.department_id, department.name as department_name, shift.role_name, shift.required_volunteers,
             shift.starts_at, shift.ends_at, shift.checkin_opens_at, shift.checkin_closes_at,
             assignment.id as assignment_id, assignment.status as assignment_status, assignment.checked_in_at
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
      where post.company_id = ${user.churchId}
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
      }],
    })),
    feedPosts: feedRows.map(toFeedPost),
  }
}
