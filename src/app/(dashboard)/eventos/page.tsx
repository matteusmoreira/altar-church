import { CalendarDays, CheckCircle2, Clock3, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
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
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-2 flex items-center gap-2"><Badge variant="outline">Central operacional</Badge><span className="text-xs text-muted-foreground">Release 1</span></div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Eventos</h1><p className="text-muted-foreground">Crie, organize e acompanhe cada evento sem perder histórico.</p></div>
        <div className="text-sm text-muted-foreground">{events.length} resultado(s) filtrado(s)</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4"><CalendarDays className="h-5 w-5 text-primary" /><div><p className="text-xs text-muted-foreground">Eventos carregados</p><p className="text-xl font-semibold">{events.length}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><CheckCircle2 className="h-5 w-5 text-emerald-500" /><div><p className="text-xs text-muted-foreground">Publicados</p><p className="text-xl font-semibold">{published}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Clock3 className="h-5 w-5 text-amber-500" /><div><p className="text-xs text-muted-foreground">Próximos</p><p className="text-xl font-semibold">{upcoming}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-sky-500" /><div><p className="text-xs text-muted-foreground">Inscrições</p><p className="text-xl font-semibold">{registrations}</p></div></CardContent></Card>
      </div>

      <EventFilters values={filters} ministries={ministries} />
      <EventCreateForm canCreate={canCreate} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} />
      <EventsListView events={events} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />
    </div>
  )
}
