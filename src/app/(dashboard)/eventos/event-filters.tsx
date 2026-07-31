import Link from "next/link"
import { Filter, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EventListFilters } from "@/lib/operational/data"
import type { ChurchEvent } from "@/lib/types"

type FilterValues = Required<EventListFilters>

const typeLabels: Record<ChurchEvent["type"], string> = {
  service: "Culto",
  prayer: "Oração",
  youth: "Jovens",
  children: "Crianças",
  special: "Especial",
  meeting: "Reunião",
}

const statusLabels: Record<ChurchEvent["status"], string> = {
  draft: "Rascunho",
  published: "Publicado",
  cancelled: "Cancelado",
}

export function EventFilters({ values, ministries }: { values: FilterValues; ministries: { id: string; name: string }[] }) {
  return (
    <form method="get" className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Filter className="h-4 w-4 text-primary" />
        Filtrar eventos
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <div className="relative md:col-span-2 xl:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="query" defaultValue={values.query} placeholder="Buscar por título ou descrição" className="pl-9" />
        </div>
        <select name="type" defaultValue={values.type} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">Todos os tipos</option>
          {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select name="status" defaultValue={values.status} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Input name="location" defaultValue={values.location} placeholder="Local" />
        <select name="ministryId" defaultValue={values.ministryId} className="h-10 rounded-md border bg-background px-3 text-sm">
          <option value="">Todos os ministérios</option>
          {ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-2">
          <Input type="date" name="from" defaultValue={values.from} aria-label="A partir de" />
          <Input type="date" name="to" defaultValue={values.to} aria-label="Até" />
        </div>
        <div className="flex gap-2 md:col-span-2 xl:col-span-1">
          <Button type="submit" className="flex-1">Aplicar</Button>
          <Button render={<Link href="/eventos" />} nativeButton={false} type="button" variant="outline" aria-label="Limpar filtros">Limpar</Button>
        </div>
      </div>
    </form>
  )
}
