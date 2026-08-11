"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { CalendarDays, CheckCircle2, ExternalLink, MapPin, Users } from "lucide-react"
import { toast } from "sonner"
import { cancelMemberEventRsvp, rsvpMemberEvent } from "@/lib/member/portal-actions"
import type { MemberAgendaEvent } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

export function MemberAgenda({ events }: { events: MemberAgendaEvent[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function submit(eventId: string, cancel = false) {
    const formData = new FormData()
    formData.set("eventId", eventId)
    startTransition(async () => {
      const result = cancel ? await cancelMemberEventRsvp(formData) : await rsvpMemberEvent(formData)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível atualizar o RSVP")
        return
      }
      const status = "status" in result ? result.status : null
      toast.success(cancel ? "RSVP cancelado" : status === "waitlisted" ? "Você entrou na lista de espera" : "Presença confirmada")
      router.refresh()
    })
  }
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">Agenda</h1><p className="text-muted-foreground">Cultos, eventos e programações da igreja.</p></div>
      {events.length === 0 && <Card className="rounded-3xl border-dashed"><CardContent className="p-6 text-sm text-muted-foreground">Nenhum evento publicado nos próximos dias.</CardContent></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((event) => (
          <Card key={event.id} className="rounded-3xl bg-card/85">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-lg">{event.title}</CardTitle>
                  {event.ministryName && <p className="mt-1 text-xs font-medium text-primary">Ministério: {event.ministryName}</p>}
                </div>
                <Badge variant="outline">{event.type || "Evento"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{event.description || "Sem descrição"}</p>
              <p className="text-sm font-semibold text-primary"><CalendarDays className="mr-2 inline h-4 w-4" />{dateTime(event.startsAt)}</p>
              {event.location && <p className="text-sm text-muted-foreground"><MapPin className="mr-2 inline h-4 w-4" />{event.location}</p>}
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs font-medium"><Users className="mr-1 inline h-3.5 w-3.5" />{event.goingCount}{event.maxCapacity !== null ? `/${event.maxCapacity}` : ""} confirmados{event.waitlistedCount > 0 ? ` · ${event.waitlistedCount} na espera` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {event.confirmedPeople.length > 0 ? event.confirmedPeople.join(", ") : "Ninguém confirmou ainda."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {event.externalLink && <Button render={<a href={event.externalLink} target="_blank" rel="noreferrer" />} nativeButton={false} variant="ghost" size="sm">Link externo <ExternalLink className="h-4 w-4" /></Button>}
                {event.canRsvp && (event.myStatus === "going" || event.myStatus === "waitlisted" ? (
                  <>
                    <Badge><CheckCircle2 className="mr-1 h-3.5 w-3.5" />{event.myStatus === "going" ? "Presença confirmada" : "Lista de espera"}</Badge>
                    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => submit(event.id, true)}>Cancelar presença</Button>
                  </>
                ) : (
                  <Button type="button" size="sm" disabled={pending} onClick={() => submit(event.id)}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Aceitar e confirmar presença
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
