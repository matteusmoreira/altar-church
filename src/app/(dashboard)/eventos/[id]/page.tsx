import { notFound } from "next/navigation"
import { requireUser } from "@/lib/auth/server"
import { getEventDetail, listEventForms, listEventMinistries } from "@/lib/operational/data"
import { getEventReport, listEventResources } from "@/lib/events/data"
import { hasPermission } from "@/lib/types"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import { EventDetailClient } from "../event-detail-client"

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  return <EventDetailClient event={event} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} report={report} resources={resources} canEdit={hasPermission(user.role, "events.edit")} canCreate={hasPermission(user.role, "events.create")} canDelete={hasPermission(user.role, "events.delete")} canExport={hasPermission(user.role, "reports.export")} />
}
