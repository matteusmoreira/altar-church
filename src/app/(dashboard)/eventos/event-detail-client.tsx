"use client"
/* eslint-disable @next/next/no-img-element */

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { CalendarDays, CheckCircle2, ClipboardCheck, FileText, Globe, MapPin, MessageSquare, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { EventDetail } from "@/lib/operational/data"
import type { EventReport, EventResourceItem } from "@/lib/events/types"
import { EventActions } from "./event-actions"
import { EventCreateForm } from "./event-create-form"
import { EventCommunicationPanel, EventPublicShare, EventReportPanel, EventResourcesPanel } from "./event-full-operations"
import { EventParticipantsPanel } from "./event-participants-panel"
import { EventCheckinPanel } from "./event-checkin-panel"
import { ExternalEventRegistration } from "@/components/events/external-event-registration"
import { eventPriceLabel } from "@/lib/events/contract"
import type { VolunteerDashboardData } from "@/lib/volunteers/types"
import { EventVolunteerOperations } from "./event-volunteer-operations"

function dateTime(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(value))
}

function shortDate(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "medium" }).format(new Date(value))
}

const statusLabels: Record<EventDetail["status"], string> = { draft: "Rascunho", published: "Publicado", cancelled: "Cancelado" }

const deliveryLabels: Record<string, string> = { draft: "Rascunho", queued: "Na fila", scheduled: "Agendada", processing: "Em envio", completed: "Concluída", failed: "Falhou", canceled: "Cancelada", dead: "Requer atenção" }

function EventNotificationHistory({ notifications }: { notifications: EventReport["notifications"] }) {
  return <Card><CardHeader><CardTitle className="text-base">Últimas comunicações</CardTitle></CardHeader><CardContent>{notifications.length ? <div className="divide-y rounded-lg border">{notifications.slice(0, 8).map((notification) => <div key={notification.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"><div><p className="font-medium">{notification.templateKey}</p><p className="text-xs text-muted-foreground">{notification.deliveryCount} destinatário(s){notification.scheduledAt ? ` · ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(notification.scheduledAt))}` : ""}</p></div><Badge variant={notification.status === "completed" ? "default" : notification.status === "failed" ? "destructive" : "secondary"}>{deliveryLabels[notification.status] || notification.status}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma comunicação agendada.</p>}</CardContent></Card>
}

export function EventDetailClient({ eventTypes, event, volunteerTemplates, ministries, forms, report, resources, canEdit, canCreate, canDelete, canExport, session, people, teamData, teamPermissions }: { eventTypes: string[]; event: EventDetail; volunteerTemplates: { id: string; name: string }[]; ministries: { id: string; name: string }[]; forms: { id: string; title: string; slug: string }[]; report: EventReport; resources: EventResourceItem[]; canEdit: boolean; canCreate: boolean; canDelete: boolean; canExport: boolean; session: { token: string; expiresAt: string } | null; people: { id: string; name: string }[]; teamData: VolunteerDashboardData | null; teamPermissions: { create: boolean; edit: boolean; publish: boolean } }) {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<"summary" | "participants" | "attendance" | "volunteer" | "communication" | "files" | "report" | "edit">(searchParams.get("edit") === "1" ? "edit" : "summary")
  const external = event.registrationMode === "external"
  const presentCount = report.present
  const scaleConfigured = event.volunteer.shiftCount > 0
  const scaleReady = scaleConfigured && event.volunteer.assignedVolunteers >= event.volunteer.requiredVolunteers
  const communicationReady = report.notifications.some((notification) => ["queued", "scheduled", "processing", "completed"].includes(notification.status))
  const tabs = [
    ["summary", "Visão geral", ClipboardCheck],
    ["participants", "Inscrições", Users],
    ["attendance", "Check-in", CheckCircle2],
    ["volunteer", "Equipe e escala", Users],
    ["communication", "Comunicação", MessageSquare],
    ["files", "Materiais", FileText],
    ["report", "Relatórios", ClipboardCheck],
  ] as const

  return (
    <div className="space-y-6">
      <PageHeader title={event.title} description={event.description || "Sem descrição"} back={{ href: "/eventos", label: "Eventos" }} badge={<><Badge>{statusLabels[event.status]}</Badge>{event.isOnline && <Badge variant="outline"><Globe className="mr-1 h-3 w-3" />Online</Badge>}{event.ministryName && <Badge variant="outline">{event.ministryName}</Badge>}</>} actions={<div className="flex gap-2">{canEdit && <Button onClick={() => setTab("edit")}>Editar evento</Button>}<EventActions eventId={event.id} eventSlug={event.slug} eventTitle={event.title} status={event.status} canEdit={canEdit} canCreate={canCreate} canDelete={canDelete} /></div>} />

      {event.banner && <img src={event.banner} alt="" className="max-h-64 w-full rounded-xl object-cover" />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {external ? <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Inscrições externas</p><p className="mt-1 text-lg font-semibold">{event.externalPlatform}</p><p className="text-xs text-muted-foreground">Vendas, vagas e entradas são acompanhadas na plataforma.</p></CardContent></Card> : <>        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Inscritos</p><p className="mt-1 text-2xl font-semibold">{event.goingCount}{event.maxCapacity > 0 ? <span className="text-sm font-normal text-muted-foreground"> / {event.maxCapacity}</span> : null}</p><p className="text-xs text-muted-foreground">{event.waitlistedCount} na lista de espera</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Presentes</p><p className="mt-1 text-2xl font-semibold">{presentCount}</p><p className="text-xs text-muted-foreground">{report.attendanceRate === null ? "Sem base de inscritos" : `${report.attendanceRate}% de comparecimento`}</p></CardContent></Card>
</>}
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Escala</p><p className="mt-1 text-2xl font-semibold">{event.volunteer.assignedVolunteers} / {event.volunteer.requiredVolunteers}</p><p className="text-xs text-muted-foreground">{scaleReady ? "Preenchida" : scaleConfigured ? "Com vagas pendentes" : "Não configurada"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Data</p><p className="mt-1 text-sm font-semibold">{shortDate(event.startDate, event.timezone)}</p><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo", timeStyle: "short" }).format(new Date(event.startDate))}</p></CardContent></Card>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1">{tabs.map(([value, label, Icon]) => <Button key={value} type="button" size="sm" variant={tab === value ? "default" : "ghost"} className="shrink-0" onClick={() => setTab(value)}><Icon className="mr-2 h-4 w-4" />{label}</Button>)}</div>

      {tab === "summary" && <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card><CardHeader><CardTitle className="text-base">Dados do evento</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><div className="flex gap-3"><CalendarDays className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Quando</p><p className="text-sm text-muted-foreground">{dateTime(event.startDate, event.timezone)}</p>{event.endDate && <p className="text-xs text-muted-foreground">até {dateTime(event.endDate, event.timezone)}</p>}</div></div><div className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Onde</p><p className="text-sm text-muted-foreground">{event.location || "Local não definido"}</p>{event.onlineLink && <a className="text-xs text-primary underline" href={event.onlineLink} target="_blank" rel="noreferrer">Abrir link online</a>}</div></div><div><p className="text-sm font-medium">Valor</p><p className="mb-3 text-sm font-semibold">{eventPriceLabel(event)}</p>{external && event.valueCents ? <p className="mb-3 text-xs text-muted-foreground">Valor de referência. Consulte as condições na plataforma.</p> : null}{event.valueInstructions && <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{event.valueInstructions}</p>}<p className="text-sm font-medium">Inscrição</p><p className="text-sm text-muted-foreground">{external ? `Pelo ${event.externalPlatform}` : event.registrationEnabled ? event.maxCapacity > 0 ? `Ativa · limite de ${event.maxCapacity}` : "Ativa · sem limite" : "Não habilitada"}</p></div><div><p className="text-sm font-medium">Origem operacional</p><p className="text-sm text-muted-foreground">{event.programmingId ? "Ocorrência de programação" : event.recurring ? "Recorrente sem série vinculada" : "Evento único"}</p>{event.recurrenceNeedsReview && <p className="mt-1 text-xs text-warning">Conflito de horário: série marcada para revisão.</p>}{event.programmingId && <Button render={<Link href="/programacao" />} nativeButton={false} variant="link" className="h-auto px-0 text-xs">Gerenciar série/ocorrências</Button>}</div><div className="sm:col-span-2"><p className="mb-2 text-sm font-medium">Divulgação</p><EventPublicShare event={event} canEdit={canEdit} />{external && <div className="mt-4"><ExternalEventRegistration event={event} disabled={event.status !== "published"} /></div>}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Checklist operacional</CardTitle></CardHeader><CardContent className="space-y-3">{[[Boolean(event.location || event.onlineLink), "Local ou link definido"], [scaleReady, event.volunteer.shiftCount ? "Escala preenchida" : event.volunteerTemplateId ? "Escala não configurada" : "Equipe não necessária (opcional)"], [event.status === "published", event.status === "published" ? "Evento publicado" : "Publicação pendente"], [communicationReady, communicationReady ? "Comunicação enfileirada" : "Comunicação pendente"], [external || presentCount > 0, external ? "Check-in pela plataforma externa" : presentCount > 0 ? "Presença já registrada" : "Check-in ainda sem registros"]].map(([done, label]) => <div key={String(label)} className="flex items-center gap-2 text-sm"><CheckCircle2 className={`h-4 w-4 ${done ? "text-success" : "text-muted-foreground/40"}`} /><button type="button" className={`text-left hover:underline ${done ? "" : "text-muted-foreground"}`} onClick={() => setTab(String(label).includes("Escala") || String(label).includes("Equipe") ? "volunteer" : String(label).includes("Comunicação") ? "communication" : String(label).includes("Check-in") || String(label).includes("Presença") ? "attendance" : "edit")}>{label}</button></div>)}<p className="border-t pt-3 text-xs text-muted-foreground">Confira as pendências antes da publicação e acompanhe os resultados nas abas do evento.</p></CardContent></Card>
      </div>}

      {tab === "edit" && canEdit && <EventCreateForm eventTypes={eventTypes} canCreate={canEdit} event={event} volunteerTemplates={volunteerTemplates} ministries={ministries} forms={forms} />}

      {tab === "participants" && (external ? <ExternalEventRegistration event={event} disabled={event.status !== "published"} /> : <EventParticipantsPanel event={event} people={people} canEdit={canEdit} canExport={canExport} />)}

      {tab === "attendance" && (external ? <ExternalEventRegistration event={event} disabled={event.status !== "published"} /> : <EventCheckinPanel event={event} session={session} canEdit={canEdit} />)}
      {tab === "report" && (external ? <Card><CardContent className="p-5 text-sm text-muted-foreground">Os relatórios de ingressos e entradas são consultados na plataforma externa. O Altar não sincroniza vendas, vagas ou presenças. O histórico interno anterior permanece preservado.</CardContent></Card> : <EventReportPanel event={event} report={report} canEdit={canEdit} />)}

      {tab === "volunteer" && <Card><CardHeader><CardTitle className="text-base">Escala de voluntários</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Turnos</p><p className="text-xl font-semibold">{event.volunteer.shiftCount}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Vagas</p><p className="text-xl font-semibold">{event.volunteer.requiredVolunteers}</p></div><div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Preenchidas</p><p className="text-xl font-semibold">{event.volunteer.assignedVolunteers}</p></div></div><p className="text-sm text-muted-foreground">{event.volunteer.shiftCount ? "Dados lidos da escala vinculada ao evento." : event.volunteerTemplateName ? `Modelo selecionado: ${event.volunteerTemplateName}. A escala ainda não foi gerada.` : "Nenhum modelo ou escala vinculado."}</p><EventVolunteerOperations key={`${event.id}-${teamData?.eventPlans.find(p => p.eventId === event.id)?.positions.map(p => p.id).join("-")}`} event={event} data={teamData} permissions={teamPermissions} /></CardContent></Card>}

      {tab === "communication" && <div className="space-y-4"><EventNotificationHistory notifications={report.notifications} /><EventCommunicationPanel event={event} canEdit={canEdit} /></div>}
      {tab === "files" && <EventResourcesPanel event={event} resources={resources} canEdit={canEdit} canDelete={canDelete} />}
    </div>
  )
}
