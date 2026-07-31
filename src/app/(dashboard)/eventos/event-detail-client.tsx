"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, FileText, Globe, MapPin, MessageSquare, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventDetail } from "@/lib/operational/data"
import type { EventReport, EventResourceItem } from "@/lib/events/types"
import { EventActions } from "./event-actions"
import { EventCreateForm } from "./event-create-form"
import { EventCommunicationPanel, EventParticipantsPanel, EventPublicShare, EventReportPanel, EventResourcesPanel } from "./event-full-operations"
import { EventVolunteerOperations } from "./event-volunteer-operations"

function dateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value))
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value))
}

const statusLabels: Record<EventDetail["status"], string> = { draft: "Rascunho", published: "Publicado", cancelled: "Cancelado" }

function EventNotificationHistory({ notifications }: { notifications: EventReport["notifications"] }) {
  return <Card><CardHeader><CardTitle className="text-base">Últimas comunicações</CardTitle></CardHeader><CardContent>{notifications.length ? <div className="divide-y rounded-lg border">{notifications.slice(0, 8).map((notification) => <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{notification.templateKey}</p><p className="text-xs text-muted-foreground">{notification.deliveryCount} destinatário(s){notification.scheduledAt ? ` · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.scheduledAt))}` : ""}</p></div><Badge variant={notification.status === "completed" ? "default" : notification.status === "failed" ? "destructive" : "secondary"}>{notification.status}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma comunicação agendada.</p>}</CardContent></Card>
}

export function EventDetailClient({ event, volunteerTemplates, ministries, forms, report, resources, canEdit, canCreate, canDelete, canExport }: { event: EventDetail; volunteerTemplates: { id: string; name: string }[]; ministries: { id: string; name: string }[]; forms: { id: string; title: string; slug: string }[]; report: EventReport; resources: EventResourceItem[]; canEdit: boolean; canCreate: boolean; canDelete: boolean; canExport: boolean }) {
  const [tab, setTab] = useState<"summary" | "participants" | "attendance" | "volunteer" | "communication" | "files">("summary")
  const presentCount = report.present
  const scaleReady = event.volunteer.requiredVolunteers === 0 || event.volunteer.assignedVolunteers >= event.volunteer.requiredVolunteers
  const communicationReady = report.notifications.some((notification) => ["queued", "scheduled", "processing", "completed"].includes(notification.status))
  const tabs = [
    ["summary", "Resumo", ClipboardCheck],
    ["participants", "Inscrições", Users],
    ["attendance", "Presença", CheckCircle2],
    ["volunteer", "Voluntariado", Users],
    ["communication", "Comunicação", MessageSquare],
    ["files", "Arquivos e observações", FileText],
  ] as const

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3"><Button render={<Link href="/eventos" />} nativeButton={false} variant="ghost" className="px-0"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para eventos</Button><div className="flex flex-wrap items-center gap-2"><Badge>{statusLabels[event.status]}</Badge>{event.isOnline && <Badge variant="outline"><Globe className="mr-1 h-3 w-3" />Online</Badge>}{event.ministryName && <Badge variant="outline">{event.ministryName}</Badge>}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{event.title}</h1><p className="max-w-3xl text-muted-foreground">{event.description || "Sem descrição"}</p></div>
        <EventActions eventId={event.id} eventTitle={event.title} status={event.status} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Inscritos</p><p className="mt-1 text-2xl font-semibold">{event.goingCount}{event.maxCapacity > 0 ? <span className="text-sm font-normal text-muted-foreground"> / {event.maxCapacity}</span> : null}</p><p className="text-xs text-muted-foreground">{event.waitlistedCount} na lista de espera</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Presentes</p><p className="mt-1 text-2xl font-semibold">{presentCount}</p><p className="text-xs text-muted-foreground">{report.attendanceRate === null ? "Sem base de inscritos" : `${report.attendanceRate}% de comparecimento`}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Escala</p><p className="mt-1 text-2xl font-semibold">{event.volunteer.assignedVolunteers} / {event.volunteer.requiredVolunteers}</p><p className="text-xs text-muted-foreground">{scaleReady ? "Preenchida" : "Com vagas pendentes"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Data</p><p className="mt-1 text-sm font-semibold">{shortDate(event.startDate)}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(event.startDate))}</p></CardContent></Card>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">{tabs.map(([value, label, Icon]) => <Button key={value} type="button" size="sm" variant={tab === value ? "default" : "ghost"} className="shrink-0" onClick={() => setTab(value)}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}</div>

      {tab === "summary" && <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card><CardHeader><CardTitle className="text-base">Dados do evento</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Quando</p><p className="text-sm text-muted-foreground">{dateTime(event.startDate)}</p>{event.endDate && <p className="text-xs text-muted-foreground">até {dateTime(event.endDate)}</p>}</div></div><div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Onde</p><p className="text-sm text-muted-foreground">{event.location || "Local não definido"}</p>{event.onlineLink && <a className="text-xs text-primary underline" href={event.onlineLink} target="_blank" rel="noreferrer">Abrir link online</a>}</div></div><div><p className="text-sm font-medium">Inscrição</p><p className="text-sm text-muted-foreground">{event.registrationEnabled ? event.maxCapacity > 0 ? `Ativa · limite de ${event.maxCapacity}` : "Ativa · sem limite" : "Não habilitada"}</p></div><div><p className="text-sm font-medium">Origem operacional</p><p className="text-sm text-muted-foreground">{event.programmingId ? "Ocorrência de programação" : event.recurring ? "Recorrente sem série vinculada" : "Evento único"}</p>{event.recurrenceNeedsReview && <p className="mt-1 text-xs text-amber-700">Conflito de horário: série marcada para revisão.</p>}{event.programmingId && <Button render={<Link href="/programacao" />} nativeButton={false} variant="link" className="h-auto px-0 text-xs">Gerenciar série/ocorrências</Button>}</div><div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Divulgação</p><EventPublicShare event={event} canEdit={canEdit} /></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Checklist operacional</CardTitle></CardHeader><CardContent className="space-y-3">{[[Boolean(event.location || event.onlineLink), "Local ou link definido"], [scaleReady, event.volunteer.shiftCount ? "Escala preenchida" : "Escala ainda não criada"], [event.status === "published", event.status === "published" ? "Evento publicado" : "Publicação pendente"], [communicationReady, communicationReady ? "Comunicação enfileirada" : "Comunicação pendente"], [presentCount > 0, presentCount > 0 ? "Presença já registrada" : "Check-in ainda sem registros"]].map(([done, label]) => <div key={String(label)} className="flex items-center gap-2 text-sm"><CheckCircle2 className={`h-4 w-4 ${done ? "text-emerald-500" : "text-muted-foreground/40"}`} /><span className={done ? "" : "text-muted-foreground"}>{label}</span></div>)}<p className="border-t pt-3 text-xs text-muted-foreground">A fila registra pendente, enviado, falho e dead letter; entrega externa continua dependente do provedor.</p></CardContent></Card>
      </div>}

      {tab === "summary" && canEdit && <EventCreateForm canCreate={canEdit} event={event} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} />}

      {tab === "participants" && <EventParticipantsPanel event={event} canEdit={canEdit} canExport={canExport} />}

      {tab === "attendance" && <EventReportPanel event={event} report={report} canEdit={canEdit} />}

      {tab === "volunteer" && <Card><CardHeader><CardTitle className="text-base">Escala de voluntários</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Turnos</p><p className="text-xl font-semibold">{event.volunteer.shiftCount}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Vagas</p><p className="text-xl font-semibold">{event.volunteer.requiredVolunteers}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Preenchidas</p><p className="text-xl font-semibold">{event.volunteer.assignedVolunteers}</p></div></div><p className="text-sm text-muted-foreground">{event.volunteer.shiftCount ? "Dados lidos da escala vinculada ao evento." : event.volunteerTemplateName ? `Modelo selecionado: ${event.volunteerTemplateName}. A escala ainda não foi gerada.` : "Nenhum modelo ou escala vinculado."}</p><EventVolunteerOperations event={event} canEdit={canEdit} /></CardContent></Card>}

      {tab === "communication" && <div className="space-y-4"><EventNotificationHistory notifications={report.notifications} /><EventCommunicationPanel event={event} canEdit={canEdit} /></div>}
      {tab === "files" && <EventResourcesPanel event={event} resources={resources} canEdit={canEdit} canDelete={canDelete} />}
    </div>
  )
}
