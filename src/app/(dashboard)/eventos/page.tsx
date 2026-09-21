import { CalendarDays, CheckCircle2, Clock3, Users } from "lucide-react"
import { MetricCard, MetricGrid, PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { requireUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"
import { listEventForms, listEventMinistries, listEvents, normalizeEventFilters } from "@/lib/operational/data"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import { EventCreateForm } from "./event-create-form"
import { EventFilters } from "./event-filters"
import { EventsListView } from "./events-list-view"

type SearchParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function EventsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = (await searchParams) ?? {}
  const filters = normalizeEventFilters({
    query: first(params.query),
    type: first(params.type) as never,
    status: first(params.status) as never,
    location: first(params.location),
    ministryId: first(params.ministryId),
    from: first(params.from),
    to: first(params.to),
  })
  const [user, events, ministries, forms, volunteerTemplates] = await Promise.all([
    requireUser(),
    listEvents(filters),
    listEventMinistries(),
    listEventForms(),
    listVolunteerTemplatesForEvents(),
  ])
  const canCreate = hasPermission(user.role, "events.create")
  const canEdit = hasPermission(user.role, "events.edit")
  const canDelete = hasPermission(user.role, "events.delete")
  const published = events.filter((event) => event.status === "published").length
  const upcoming = events.filter((event) => event.status === "published" && new Date(event.startDate) >= new Date()).length
  const registrations = events.reduce((total, event) => total + event.goingCount, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Eventos" description="Crie, organize e acompanhe cada evento sem perder histórico." badge={<><Badge variant="outline">Central operacional</Badge><span className="text-xs text-muted-foreground">Release 1</span></>} actions={<div className="text-sm text-muted-foreground">{events.length} resultado(s) filtrado(s)</div>} />

      <MetricGrid columns={4}>
        <MetricCard variant="compact" title="Eventos carregados" value={events.length} icon={CalendarDays} tone="primary" />
        <MetricCard variant="compact" title="Publicados" value={published} icon={CheckCircle2} tone="success" />
        <MetricCard variant="compact" title="Próximos" value={upcoming} icon={Clock3} tone="warning" />
        <MetricCard variant="compact" title="Inscrições" value={registrations} icon={Users} tone="info" />
      </MetricGrid>

      <EventFilters values={filters} ministries={ministries} />
      <EventCreateForm canCreate={canCreate} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} />
      <EventsListView events={events} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />
    </div>
  )
}
