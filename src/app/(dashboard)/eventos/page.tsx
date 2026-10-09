import { listEventTypes } from "@/lib/events/data"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CalendarDays, CheckCircle2, Clock3, Users } from "lucide-react"
import { MetricCard, MetricGrid, PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { requireUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"
import { listEventMinistries, listEvents, normalizeEventFilters } from "@/lib/operational/data"
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
  const [user, events, ministries, eventTypes] = await Promise.all([
    requireUser(),
    listEvents(filters, undefined, Number(first(params.page) || 1)),
    listEventMinistries(),
    listEventTypes(),
  ])
  const listing = events
  const pageEvents = listing.events
  const pageHref = (page: number) => { const query = new URLSearchParams(); for (const [key, value] of Object.entries(params)) { const item = first(value); if (item) query.set(key, item) }; query.set("page", String(page)); return `/eventos?${query}` }
  const canCreate = hasPermission(user, "events.create")
  const canEdit = hasPermission(user, "events.edit")
  const canDelete = hasPermission(user, "events.delete")

  return (
    <div className="space-y-6">
      <PageHeader title="Eventos" description="Crie, organize e acompanhe cada evento sem perder histórico." badge={<Badge variant="outline">Organização de eventos</Badge>} actions={canCreate ? <Button render={<Link href="/eventos/novo" />} nativeButton={false}>Novo evento</Button> : undefined} />

      <MetricGrid columns={4}>
        <MetricCard variant="compact" title="Eventos encontrados" value={listing.total} icon={CalendarDays} tone="primary" />
        <MetricCard variant="compact" title="Publicados" value={listing.published} icon={CheckCircle2} tone="success" />
        <MetricCard variant="compact" title="Próximos" value={listing.upcoming} icon={Clock3} tone="warning" />
        <MetricCard variant="compact" title="Inscrições" value={listing.registrations} icon={Users} tone="info" />
      </MetricGrid>

      <EventFilters eventTypes={[...new Set([...eventTypes, ...pageEvents.map(event => event.type)])]} values={filters} ministries={ministries} />
      <EventsListView events={pageEvents} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />
      {listing.total > listing.pageSize && <nav aria-label="Paginação dos eventos" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Página {listing.page} de {Math.ceil(listing.total / listing.pageSize)} · {listing.total} eventos</p><div className="flex gap-2">{listing.page > 1 && <Button variant="outline" render={<Link href={pageHref(listing.page - 1)} />}>Anterior</Button>}{listing.page * listing.pageSize < listing.total && <Button variant="outline" render={<Link href={pageHref(listing.page + 1)} />}>Próxima</Button>}</div></nav>}
    </div>
  )
}
