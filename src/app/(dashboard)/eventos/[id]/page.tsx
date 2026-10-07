import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/server"
import { getEventDetail, listEventForms, listEventMinistries } from "@/lib/operational/data"
import { getEventReport, listEventResources } from "@/lib/events/data"
import { hasPermission } from "@/lib/types"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import { EventDetailClient } from "../event-detail-client"

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("events", identifier)
  if (!route) notFound()
  const id = route.id
  const [user, event, volunteerTemplates, ministries, forms, report, resources] = await Promise.all([
    requireUser(),
    getEventDetail(id),
    listVolunteerTemplatesForEvents(),
    listEventMinistries(),
    listEventForms(),
    getEventReport(id),
    listEventResources(id),
  ]).catch((error) => {
    if (error instanceof Error && /não encontrado|nao encontrado|inválido|invalido/i.test(error.message)) notFound()
    throw error
  })
  if (identifier !== route.slug) redirect(canonicalEntityPath("/eventos", route.slug, await searchParams))
  return <EventDetailClient event={event} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} report={report} resources={resources} canEdit={hasPermission(user, "events.edit")} canCreate={hasPermission(user, "events.create")} canDelete={hasPermission(user, "events.delete")} canExport={hasPermission(user, "reports.export")} />
}
