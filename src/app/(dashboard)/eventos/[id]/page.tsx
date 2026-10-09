import { listEventTypes } from "@/lib/events/data"
import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { getSql } from "@/lib/db/client"
import { requireUser } from "@/lib/auth/server"
import { getEventDetail, listPeopleDirectory, listEventForms, listEventMinistries } from "@/lib/operational/data"
import { getEventReport, getEventActiveCheckinSession, listEventResources } from "@/lib/events/data"
import { hasPermission } from "@/lib/types"
import { listVolunteerTemplatesForEvents, getVolunteerDashboardData } from "@/lib/volunteers/data"
import { EventDetailClient } from "../event-detail-client"

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("events", identifier)
  if (!route) notFound()
  const id = route.id
  const [user, event, volunteerTemplates, ministries, forms, report, resources, eventTypes] = await Promise.all([
    requireUser(),
    getEventDetail(id),
    listVolunteerTemplatesForEvents(),
    listEventMinistries(),
    listEventForms(),
    getEventReport(id),
    listEventResources(id),
    listEventTypes(),
  ]).catch((error) => {
    if (error instanceof Error && /não encontrado|nao encontrado|inválido|invalido/i.test(error.message)) notFound()
    throw error
  })
  const [session, people] = await Promise.all([getEventActiveCheckinSession(id), hasPermission(user, "events.edit") ? listPeopleDirectory() : Promise.resolve([])])
  const teamData = hasPermission(user, "volunteers.view") ? await getVolunteerDashboardData(undefined, event.startDate.slice(0, 7)).catch(error => { if (/Acesso negado/.test(error.message)) return null; throw error }) : null
  if (teamData) {
    const sql = getSql()
    const allowedDepartments = teamData.departments.map(item => item.id)
    const positions = await sql<{ id: string; departmentId: string; departmentName: string; roleId: string; roleName: string; requiredVolunteers: number; instructions: string }[]>`select position.id, position.department_id as "departmentId", department.name as "departmentName", position.role_id as "roleId", position.role_name as "roleName", position.required_volunteers as "requiredVolunteers", position.instructions from public.volunteer_event_positions position join public.volunteer_departments department on department.id = position.department_id and department.company_id = position.company_id where position.event_id = ${id} and position.company_id = ${event.churchId} and position.department_id = any(${allowedDepartments}::uuid[]) order by position.sort_order`
    const [publication] = await sql<{ published_at: Date | null }[]>`select volunteer_schedule_published_at as published_at from public.events where id = ${id} and company_id = ${event.churchId}`
    const existing = teamData.eventPlans.find(plan => plan.eventId === id)
    if (existing) { existing.positions = positions; existing.schedulePublishedAt = publication?.published_at?.toISOString() ?? null }
    else teamData.eventPlans.push({ eventId: id, eventTitle: event.title, startsAt: event.startDate, schedulePublishedAt: publication?.published_at?.toISOString() ?? null, positions, timeline: [], setlistId: null, setlistTitle: "", setlistNotes: "", setlistItems: [] })
  }
  if (identifier !== route.slug) redirect(canonicalEntityPath("/eventos", route.slug, await searchParams))
  return <EventDetailClient eventTypes={eventTypes} session={session} people={people.map(p => ({ id: p.id, name: p.fullName }))} teamData={teamData} teamPermissions={{ create: hasPermission(user, "schedules.create"), edit: hasPermission(user, "schedules.edit"), publish: hasPermission(user, "schedules.publish") }} event={event} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} report={report} resources={resources} canEdit={hasPermission(user, "events.edit")} canCreate={hasPermission(user, "events.create")} canDelete={hasPermission(user, "events.delete")} canExport={hasPermission(user, "reports.export")} />
}
