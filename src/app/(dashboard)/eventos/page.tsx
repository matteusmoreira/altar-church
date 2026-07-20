import { CalendarDays, Clock, Globe, MapPin, Trash2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { deleteEvent } from "@/lib/operational/actions"
import { listEvents } from "@/lib/operational/data"
import { requireUser } from "@/lib/auth/server"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import { hasPermission, type ChurchEvent } from "@/lib/types"
import { EventCreateForm } from "./event-create-form"

async function deleteEventForm(formData: FormData) {
  "use server"
  await deleteEvent(formData)
}

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

export default async function EventsPage() {
  const [user, events, volunteerTemplates] = await Promise.all([
    requireUser(),
    listEvents(),
    listVolunteerTemplatesForEvents(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Eventos</h1>
        <p className="text-muted-foreground">Cultos, reuniões e eventos especiais persistidos.</p>
      </div>

      <EventCreateForm
        canCreate={hasPermission(user.role, "events.create")}
        volunteerTemplates={volunteerTemplates}
      />

      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id} className="glass overflow-hidden">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <CalendarDays className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{event.title}</h2>
                      <Badge>{typeLabels[event.type]}</Badge>
                      <Badge variant={event.status === "published" ? "default" : "secondary"}>
                        {statusLabels[event.status]}
                      </Badge>
                      {event.isOnline && (
                        <Badge variant="outline">
                          <Globe className="mr-1 h-3 w-3" />
                          Online
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{event.description || "Sem descrição"}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(event.startDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location || "Sem local"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {event.attendance}/{event.maxCapacity || "sem limite"}
                      </span>
                    </div>
                  </div>
                </div>
                <form action={deleteEventForm}>
                  <input type="hidden" name="id" value={event.id} />
                  <Button type="submit" variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhum evento encontrado</p>
        </div>
      )}
    </div>
  )
}
