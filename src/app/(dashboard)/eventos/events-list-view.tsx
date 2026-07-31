"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Globe, MapPin, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EventActions } from "./event-actions"
import type { EventListItem } from "@/lib/operational/data"
import type { ChurchEvent } from "@/lib/types"

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

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

function eventDay(event: EventListItem) {
  return dateKey(new Date(event.startDate))
}

function statusVariant(status: ChurchEvent["status"]): "default" | "secondary" | "outline" {
  return status === "published" ? "default" : status === "cancelled" ? "outline" : "secondary"
}

function EventCard({ event, canEdit, canCreate, canDelete }: { event: EventListItem; canEdit: boolean; canCreate: boolean; canDelete: boolean }) {
  return (
    <Card className="glass overflow-hidden transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 sm:flex">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button render={<Link href={`/eventos/${event.id}`} />} nativeButton={false} variant="link" className="h-auto min-w-0 p-0 text-left text-base font-semibold text-foreground">
                {event.title}
              </Button>
              <Badge variant="outline">{typeLabels[event.type]}</Badge>
              <Badge variant={statusVariant(event.status)}>{statusLabels[event.status]}</Badge>
              {event.isOnline && <Badge variant="outline"><Globe className="mr-1 h-3 w-3" />Online</Badge>}
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{event.description || "Sem descrição"}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dateTime(event.startDate)}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location || "Sem local"}</span>
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{event.goingCount} inscritos · {event.attendance} presentes</span>
              {event.maxCapacity > 0 && <span>Limite {event.maxCapacity}</span>}
            </div>
            {event.ministryName && <p className="text-xs text-primary">Ministério: {event.ministryName}</p>}
          </div>
          <EventActions eventId={event.id} eventTitle={event.title} status={event.status} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />
        </div>
      </CardContent>
    </Card>
  )
}

function MonthView({ events, cursor, onCursorChange }: { events: EventListItem[]; cursor: Date; onCursorChange: (date: Date) => void }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), index + 1))]
  const byDay = new Map<string, EventListItem[]>()
  events.forEach((event) => byDay.set(eventDay(event), [...(byDay.get(eventDay(event)) ?? []), event]))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold capitalize">{new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(cursor)}</h2>
        <div className="flex gap-1"><Button size="icon" variant="outline" onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border">
        {weekdays.map((day) => <div key={day} className="border-b bg-muted/40 p-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}
        {cells.map((day, index) => {
          const items = day ? byDay.get(dateKey(day)) ?? [] : []
          return <div key={day ? dateKey(day) : `empty-${index}`} className="min-h-28 border-b border-r p-2 align-top last:border-r-0">
            {day && <><div className="mb-2 text-xs font-semibold text-muted-foreground">{day.getDate()}</div><div className="space-y-1">{items.map((event) => <Button key={event.id} render={<Link href={`/eventos/${event.id}`} />} nativeButton={false} variant="ghost" className="h-auto w-full justify-start truncate p-1 text-left text-xs">{event.title}</Button>)}</div></>}
          </div>
        })}
      </div>
    </div>
  )
}

function WeekView({ events, cursor, onCursorChange, canEdit, canCreate, canDelete }: { events: EventListItem[]; cursor: Date; onCursorChange: (date: Date) => void; canEdit: boolean; canCreate: boolean; canDelete: boolean }) {
  const monday = new Date(cursor)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index))
  const byDay = new Map<string, EventListItem[]>()
  events.forEach((event) => byDay.set(eventDay(event), [...(byDay.get(eventDay(event)) ?? []), event]))
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold">Semana de {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(monday)}</h2><div className="flex gap-1"><Button size="icon" variant="outline" onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => onCursorChange(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7))}><ChevronRight className="h-4 w-4" /></Button></div></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">{days.map((day, index) => <section key={dateKey(day)} className="min-h-40 rounded-xl border bg-card/60 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">{weekdays[index]}</span><span className="text-xs text-muted-foreground">{day.getDate()}/{day.getMonth() + 1}</span></div><div className="space-y-2">{(byDay.get(dateKey(day)) ?? []).map((event) => <EventCard key={event.id} event={event} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />)}{!(byDay.get(dateKey(day)) ?? []).length && <p className="text-xs text-muted-foreground">Sem eventos</p>}</div></section>)}</div>
    </div>
  )
}

export function EventsListView({ events, canEdit, canCreate, canDelete }: { events: EventListItem[]; canEdit: boolean; canCreate: boolean; canDelete: boolean }) {
  const [view, setView] = useState<"list" | "month" | "week">("list")
  const [cursor, setCursor] = useState(() => new Date(events[0]?.startDate ?? Date.now()))
  const monthEvents = useMemo(() => events.filter((event) => new Date(event.startDate).getMonth() === cursor.getMonth() && new Date(event.startDate).getFullYear() === cursor.getFullYear()), [cursor, events])
  if (!events.length) return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"><CalendarDays className="h-12 w-12 text-muted-foreground/50" /><p className="mt-4 text-sm text-muted-foreground">Nenhum evento encontrado com esses filtros.</p></div>

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{view === "month" ? `${monthEvents.length} evento(s) no mês` : `${events.length} evento(s) encontrado(s)`}</p><div className="flex rounded-lg border p-1">{(["list", "month", "week"] as const).map((item) => <Button key={item} type="button" size="sm" variant={view === item ? "default" : "ghost"} onClick={() => setView(item)}>{item === "list" ? "Lista" : item === "month" ? "Mês" : "Semana"}</Button>)}</div></div>
      {view === "list" && <div className="space-y-3">{events.map((event) => <EventCard key={event.id} event={event} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />)}</div>}
      {view === "month" && <MonthView events={monthEvents} cursor={cursor} onCursorChange={setCursor} />}
      {view === "week" && <WeekView events={events} cursor={cursor} onCursorChange={setCursor} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />}
    </section>
  )
}
