import { CalendarDays, Clock, Globe, MapPin, Plus, Trash2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { deleteEvent, saveEvent } from "@/lib/operational/actions"
import { listEvents } from "@/lib/operational/data"
import { listVolunteerTemplatesForEvents } from "@/lib/volunteers/data"
import type { ChurchEvent } from "@/lib/types"

async function saveEventForm(formData: FormData) {
  "use server"
  await saveEvent(formData)
}

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
  const [events, volunteerTemplates] = await Promise.all([listEvents(), listVolunteerTemplatesForEvents()])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Eventos</h1>
        <p className="text-muted-foreground">Cultos, reuniões e eventos especiais persistidos.</p>
      </div>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-primary" />
            Novo Evento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={saveEventForm} className="grid gap-4 lg:grid-cols-6">
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" name="title" placeholder="Culto de domingo" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="type">Tipo</Label>
              <Select name="type" defaultValue="service">
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="published">
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="startDate">Início *</Label>
              <Input id="startDate" name="startDate" type="datetime-local" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">Fim</Label>
              <Input id="endDate" name="endDate" type="datetime-local" />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="location">Local</Label>
              <Input id="location" name="location" placeholder="Templo principal" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="maxCapacity">Capacidade</Label>
              <Input id="maxCapacity" name="maxCapacity" type="number" min="0" placeholder="0" />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="onlineLink">Link online</Label>
              <Input id="onlineLink" name="onlineLink" placeholder="https://..." />
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <Label htmlFor="volunteerTemplateId">Template de voluntariado</Label>
              <Select name="volunteerTemplateId" defaultValue="none">
                <SelectTrigger id="volunteerTemplateId"><SelectValue placeholder="Sem vagas de voluntariado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem template</SelectItem>
                  {volunteerTemplates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-4">
              <input type="hidden" name="isPublic" value="true" />
              <label className="flex items-center gap-2 text-sm">
                <input name="registrationEnabled" type="checkbox" className="h-4 w-4 rounded border-border" />
                Inscrição
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="isOnline" type="checkbox" className="h-4 w-4 rounded border-border" />
                Online
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="recurring" type="checkbox" className="h-4 w-4 rounded border-border" />
                Recorrente
              </label>
            </div>
            <div className="grid gap-2 lg:col-span-6">
              <Label htmlFor="description">Descrição</Label>
              <Textarea id="description" name="description" rows={3} placeholder="Detalhes do evento" />
            </div>
            <div className="lg:col-span-6">
              <Button type="submit" className="gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Criar Evento
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
