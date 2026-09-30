"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import {
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DoorOpen,
  Play,
  Plus,
  Trash2,
  Users,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { EmptyState } from "@/components/shared"
import { usePermission } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import {
  addKidSessionClassroom,
  cancelKidSession,
  closeKidSession,
  deleteKidSession,
  deleteKidStaffAssignment,
  openKidSession,
  removeKidSessionClassroom,
  saveKidSession,
  saveKidStaffAssignment,
} from "@/lib/kids/actions"
import type {
  KidClassroomItem,
  KidSessionListItem,
  KidSessionStatus,
  KidsSessionsData,
  KidStaffRole,
} from "@/lib/kids/types"

const STATUS_LABELS: Record<KidSessionStatus, string> = {
  draft: "Rascunho",
  open: "Aberta",
  closed: "Encerrada",
  cancelled: "Cancelada",
}

const STATUS_VARIANTS: Record<KidSessionStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  open: "default",
  closed: "outline",
  cancelled: "destructive",
}

const ROLE_LABELS: Record<KidStaffRole, string> = {
  leader: "Líder",
  teacher: "Professor",
  helper: "Auxiliar",
  reception: "Recepção",
}

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function formatDateTime(value: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function formatSessionInterval(startsAt: string, endsAt?: string | null) {
  if (!startsAt) return "—"
  const startDate = new Date(startsAt)
  if (isNaN(startDate.getTime())) return "—"

  const startFormatted = formatDateTime(startsAt)
  if (!endsAt) return startFormatted

  const endDate = new Date(endsAt)
  if (isNaN(endDate.getTime())) return startFormatted

  const isSameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate()

  if (isSameDay) {
    const endHour = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(endDate)
    return `${startFormatted} às ${endHour}`
  }

  return `${startFormatted} até ${formatDateTime(endsAt)}`
}

function toLocalInputValue(iso: string) {
  if (!iso) return ""
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function ageRangeLabel(minMonths: number | null, maxMonths: number | null) {
  const fmt = (m: number | null) => {
    if (m == null) return ""
    const y = Math.floor(m / 12)
    const rem = m % 12
    if (y === 0) return `${rem}m`
    if (rem === 0) return `${y}a`
    return `${y}a ${rem}m`
  }
  if (minMonths == null && maxMonths == null) return "Todas as idades"
  if (minMonths != null && maxMonths != null) return `${fmt(minMonths)} a ${fmt(maxMonths)}`
  if (minMonths != null) return `A partir de ${fmt(minMonths)}`
  return `Até ${fmt(maxMonths)}`
}

interface SessionForm {
  id: string | null
  title: string
  congregationId: string
  eventId: string
  startsAt: string
  endsAt: string
  classroomIds: string[]
}

const emptySessionForm: SessionForm = {
  id: null,
  title: "",
  congregationId: "",
  eventId: "",
  startsAt: "",
  endsAt: "",
  classroomIds: [],
}

interface KidsSessionsTabProps {
  data: KidsSessionsData
  allClassrooms?: KidClassroomItem[]
  onReload?: () => Promise<void>
  onNavigateToClassrooms?: () => void
}

export function KidsSessionsTab({
  data,
  allClassrooms,
  onReload,
  onNavigateToClassrooms,
}: KidsSessionsTabProps) {
  const router = useRouter()
  const canManage = usePermission("kids.sessions.manage")
  const [sessionForm, setSessionForm] = useState<SessionForm>(emptySessionForm)
  const [customTimesOpen, setCustomTimesOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<"all" | KidSessionStatus>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [classroomPick, setClassroomPick] = useState<Record<string, string>>({})
  const [staffPick, setStaffPick] = useState<
    Record<string, { profileId: string; sessionClassroomId: string; assignmentRole: KidStaffRole }>
  >({})
  const [confirmAction, setConfirmAction] = useState<{
    kind: "close" | "cancel" | "delete"
    session: KidSessionListItem
  } | null>(null)
  const [pending, setPending] = useState(false)

  // Lista unificada de salas (combina prop ou data do servidor)
  const classroomsList = allClassrooms && allClassrooms.length > 0 ? allClassrooms : data.classrooms

  // Salas filtradas por congregação se houver uma selecionada no formulário
  const filteredClassrooms = sessionForm.congregationId
    ? classroomsList.filter(
        (classroom) => !classroom.congregationId || classroom.congregationId === sessionForm.congregationId,
      )
    : classroomsList

  // Evento selecionado no form
  const selectedEvent = data.eventOptions.find((event) => event.id === sessionForm.eventId)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        toast.success(success)
        after?.()
        if (onReload) {
          await onReload()
        } else {
          router.refresh()
        }
      }
    } finally {
      setPending(false)
    }
  }

  function handleEventChange(eventId: string) {
    if (!eventId) {
      setSessionForm((prev) => ({
        ...prev,
        eventId: "",
      }))
      setCustomTimesOpen(false)
      return
    }

    const event = data.eventOptions.find((item) => item.id === eventId)
    if (!event) {
      setSessionForm((prev) => ({ ...prev, eventId }))
      return
    }

    const startsAt = toLocalInputValue(event.startsAt)
    let endsAt = event.endsAt ? toLocalInputValue(event.endsAt) : ""

    // Se o evento não possui término especificado, calcula padrão de 2 horas
    if (!endsAt && event.startsAt) {
      const startD = new Date(event.startsAt)
      if (!isNaN(startD.getTime())) {
        startD.setHours(startD.getHours() + 2)
        endsAt = toLocalInputValue(startD.toISOString())
      }
    }

    setSessionForm((prev) => {
      // Preenche o título se estiver vazio ou se era o título padrão de outro evento
      const shouldUpdateTitle =
        !prev.title.trim() ||
        data.eventOptions.some((ev) => ev.title === prev.title) ||
        prev.title.startsWith("Culto ")

      return {
        ...prev,
        eventId,
        startsAt,
        endsAt,
        title: shouldUpdateTitle ? event.title : prev.title,
      }
    })

    // Ao vincular a um evento, os horários ficam automaticamente recolhidos
    setCustomTimesOpen(false)
  }

  async function submitSession() {
    await run(
      () =>
        saveKidSession({
          id: sessionForm.id,
          title: sessionForm.title,
          congregationId: sessionForm.congregationId || null,
          eventId: sessionForm.eventId || null,
          startsAt: sessionForm.startsAt,
          endsAt: sessionForm.endsAt || null,
          classroomIds: sessionForm.classroomIds,
        }),
      sessionForm.id ? "Sessão atualizada" : "Sessão criada",
      () => {
        setSessionForm(emptySessionForm)
        setCustomTimesOpen(false)
      },
    )
  }

  function startEdit(session: KidSessionListItem) {
    const startsAt = toLocalInputValue(session.startsAt)
    const endsAt = toLocalInputValue(session.endsAt ?? "")

    setSessionForm({
      id: session.id,
      title: session.title,
      congregationId: session.congregationId ?? "",
      eventId: session.eventId ?? "",
      startsAt,
      endsAt,
      classroomIds: session.classrooms.map((classroom) => classroom.classroomId),
    })

    // Se a sessão já possui evento vinculado mas os horários foram customizados
    const ev = data.eventOptions.find((e) => e.id === session.eventId)
    if (ev && toLocalInputValue(ev.startsAt) !== startsAt) {
      setCustomTimesOpen(true)
    } else {
      setCustomTimesOpen(false)
    }
  }

  const availableClassrooms = (session: KidSessionListItem) =>
    classroomsList.filter((classroom) => !session.classrooms.some((sc) => sc.classroomId === classroom.id))

  // Filtro de sessões
  const filteredSessions = data.sessions.filter((session) => {
    if (statusFilter === "all") return true
    return session.status === statusFilter
  })

  const openCount = data.sessions.filter((s) => s.status === "open").length
  const draftCount = data.sessions.filter((s) => s.status === "draft").length
  const closedCount = data.sessions.filter((s) => s.status === "closed").length

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {canManage && (
        <Card className="glass h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" />
              {sessionForm.id ? "Editar sessão" : "Nova sessão"}
            </CardTitle>
            <CardDescription>
              Sessão representa a operação Kids durante um culto ou evento especial.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Título */}
            <div className="space-y-1.5">
              <Label htmlFor="session-title">Título da sessão *</Label>
              <Input
                id="session-title"
                placeholder="Ex: Culto Domingo - 19h"
                value={sessionForm.title}
                onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })}
              />
            </div>

            {/* Congregação */}
            <div className="space-y-1.5">
              <Label htmlFor="session-congregation">Congregação</Label>
              <select
                id="session-congregation"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={sessionForm.congregationId}
                onChange={(event) => setSessionForm({ ...sessionForm, congregationId: event.target.value })}
              >
                <option value="">Todas / sede</option>
                {data.congregations.map((congregation) => (
                  <option key={congregation.id} value={congregation.id}>
                    {congregation.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Evento vinculado */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="session-event">Evento vinculado (opcional)</Label>
                {selectedEvent && (
                  <span className="text-[11px] text-primary font-medium flex items-center gap-1">
                    <CalendarCheck className="h-3 w-3" /> Vinculado
                  </span>
                )}
              </div>
              <select
                id="session-event"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={sessionForm.eventId}
                onChange={(event) => handleEventChange(event.target.value)}
              >
                <option value="">Nenhum (sessão avulsa)</option>
                {data.eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} · {formatDateTime(event.startsAt)}
                  </option>
                ))}
              </select>
            </div>

            {/* Início e Término: com suporte a herdar automaticamente do evento */}
            {selectedEvent && !customTimesOpen ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                    <span>Data e horário herdados do evento</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-6 text-[11px] text-primary hover:text-primary/80"
                    onClick={() => setCustomTimesOpen(true)}
                  >
                    Personalizar horários
                  </Button>
                </div>
                <p className="text-muted-foreground font-medium">
                  {formatSessionInterval(selectedEvent.startsAt, sessionForm.endsAt || selectedEvent.endsAt)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Início e término preenchidos automaticamente a partir do evento vinculado.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedEvent && customTimesOpen && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Horários personalizados
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-5 p-0 text-xs text-primary"
                      onClick={() => {
                        const startsAt = toLocalInputValue(selectedEvent.startsAt)
                        let endsAt = selectedEvent.endsAt ? toLocalInputValue(selectedEvent.endsAt) : ""
                        if (!endsAt && selectedEvent.startsAt) {
                          const startD = new Date(selectedEvent.startsAt)
                          if (!isNaN(startD.getTime())) {
                            startD.setHours(startD.getHours() + 2)
                            endsAt = toLocalInputValue(startD.toISOString())
                          }
                        }
                        setSessionForm((prev) => ({ ...prev, startsAt, endsAt }))
                        setCustomTimesOpen(false)
                      }}
                    >
                      Restaurar horário do evento
                    </Button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="session-starts">Início *</Label>
                    <Input
                      id="session-starts"
                      type="datetime-local"
                      value={sessionForm.startsAt}
                      onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="session-ends">Término</Label>
                    <Input
                      id="session-ends"
                      type="datetime-local"
                      value={sessionForm.endsAt}
                      onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Salas da sessão */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Salas ativas nesta sessão</Label>
                {filteredClassrooms.length > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-primary hover:underline font-medium"
                    onClick={() =>
                      setSessionForm((prev) => ({
                        ...prev,
                        classroomIds:
                          prev.classroomIds.length === filteredClassrooms.length
                            ? []
                            : filteredClassrooms.map((c) => c.id),
                      }))
                    }
                  >
                    {sessionForm.classroomIds.length === filteredClassrooms.length
                      ? "Desmarcar todas"
                      : "Selecionar todas"}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selecione as salas que funcionarão durante este culto. Se nenhuma for marcada,{" "}
                <span className="font-medium text-foreground">todas as salas ativas</span> serão abertas automaticamente.
              </p>

              {classroomsList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 p-3 text-xs text-muted-foreground space-y-2">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <DoorOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span>Nenhuma sala cadastrada no sistema</span>
                  </div>
                  <p>
                    As salas organizam as crianças por turma/idade (ex: Berçário, Maternal, Kids).
                  </p>
                  <p>
                    Você pode criar esta sessão agora; assim que cadastrar as salas na aba <strong>Salas</strong>, poderá vinculá-las aqui.
                  </p>
                  {onNavigateToClassrooms && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="h-7 text-xs"
                      onClick={onNavigateToClassrooms}
                    >
                      Ir para aba Salas
                    </Button>
                  )}
                </div>
              ) : filteredClassrooms.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground">
                  Nenhuma sala cadastrada para a congregação selecionada.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-border/60 p-2">
                  {filteredClassrooms.map((classroom) => {
                    const isChecked = sessionForm.classroomIds.includes(classroom.id)
                    return (
                      <label
                        key={classroom.id}
                        className={cn(
                          "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors cursor-pointer select-none",
                          isChecked
                            ? "border-primary/50 bg-primary/5 font-medium text-foreground"
                            : "border-transparent hover:bg-muted/50 text-muted-foreground",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary shrink-0"
                            checked={isChecked}
                            onChange={(event) =>
                              setSessionForm((prev) => ({
                                ...prev,
                                classroomIds: event.target.checked
                                  ? [...prev.classroomIds, classroom.id]
                                  : prev.classroomIds.filter((id) => id !== classroom.id),
                              }))
                            }
                          />
                          <span className="truncate text-foreground font-medium">{classroom.name}</span>
                          {classroom.location && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              ({classroom.location})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-muted-foreground">
                            {ageRangeLabel(classroom.minAgeMonths, classroom.maxAgeMonths)}
                          </span>
                          {classroom.capacity > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                              Cap. {classroom.capacity}
                            </Badge>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}

              {classroomsList.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {sessionForm.classroomIds.length === 0 ? (
                    <span className="italic">💡 Padrão: todas as salas ativas abrirão para esta sessão.</span>
                  ) : (
                    <span className="text-primary font-medium">
                      ✓ {sessionForm.classroomIds.length} sala(s) selecionada(s) para esta sessão.
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Ações do formulário */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={submitSession}
                disabled={pending || !sessionForm.title.trim() || !sessionForm.startsAt}
              >
                {sessionForm.id ? "Salvar alterações" : "Criar sessão"}
              </Button>
              {sessionForm.id && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSessionForm(emptySessionForm)
                    setCustomTimesOpen(false)
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de sessões */}
      <div className="space-y-4 lg:col-span-2">
        {/* Filtros de status */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant={statusFilter === "all" ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusFilter("all")}
            >
              Todas ({data.sessions.length})
            </Button>
            <Button
              type="button"
              variant={statusFilter === "open" ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusFilter("open")}
            >
              Abertas ({openCount})
            </Button>
            <Button
              type="button"
              variant={statusFilter === "draft" ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusFilter("draft")}
            >
              Rascunhos ({draftCount})
            </Button>
            <Button
              type="button"
              variant={statusFilter === "closed" ? "default" : "outline"}
              size="xs"
              onClick={() => setStatusFilter("closed")}
            >
              Encerradas ({closedCount})
            </Button>
          </div>
        </div>

        {filteredSessions.length === 0 && (
          <Card className="glass">
            <CardContent className="p-0">
              <EmptyState
                icon={CalendarPlus}
                title={
                  statusFilter === "all"
                    ? "Nenhuma sessão cadastrada"
                    : `Nenhuma sessão com status "${STATUS_LABELS[statusFilter]}"`
                }
                description="Crie uma nova sessão para operar o check-in e check-out infantil."
              />
            </CardContent>
          </Card>
        )}

        {filteredSessions.map((session) => {
          const isOpen = session.status === "open"
          return (
            <Card
              key={session.id}
              className={cn("glass transition-all", isOpen && "border-primary/50 shadow-sm bg-primary/[0.02]")}
            >
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{session.title}</CardTitle>
                      {isOpen && (
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Sessão em andamento" />
                      )}
                    </div>
                    <CardDescription className="mt-1">
                      {formatSessionInterval(session.startsAt, session.endsAt)}
                      {session.congregationName ? ` · ${session.congregationName}` : ""}
                      {session.eventTitle ? ` · Evento: ${session.eventTitle}` : ""}
                    </CardDescription>
                  </div>
                  <Badge variant={STATUS_VARIANTS[session.status]}>{STATUS_LABELS[session.status]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <strong>{session.presentCount}</strong> presente(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    <strong>{session.checkedOutCount}</strong> saída(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    capacidade total: <strong>{session.totalCapacity}</strong>
                  </span>
                </div>

                {/* Badges das salas */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {session.classrooms.length === 0 ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      ⚠️ Nenhuma sala vinculada à sessão
                    </span>
                  ) : (
                    session.classrooms.map((classroom) => (
                      <Badge
                        key={classroom.id}
                        variant={classroom.occupied >= classroom.effectiveCapacity ? "destructive" : "outline"}
                      >
                        {classroom.name}: {classroom.occupied}/{classroom.effectiveCapacity}
                        {!classroom.isOpen ? " · fechada" : ""}
                      </Badge>
                    ))
                  )}
                </div>

                {/* Badges de voluntários */}
                {session.staff.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {session.staff.map((staff) => (
                      <Badge key={staff.id} variant="secondary">
                        {staff.profileName} · {ROLE_LABELS[staff.assignmentRole]}
                        {staff.classroomName ? ` · ${staff.classroomName}` : ""}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isOpen && (
                    <Button
                      type="button"
                      size="sm"
                      className="font-medium bg-primary text-primary-foreground"
                      render={<Link href={`/kids/recepcao?session=${session.id}`} />}
                    >
                      <DoorOpen className="mr-1.5 h-4 w-4" />
                      Recepção / Check-in
                    </Button>
                  )}
                  {canManage && session.status === "draft" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void run(() => openKidSession(session.id), "Sessão aberta")}
                    >
                      <Play className="mr-1 h-4 w-4" />
                      Abrir sessão
                    </Button>
                  )}
                  {canManage && session.status === "draft" && (
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(session)}>
                      Editar
                    </Button>
                  )}
                  {canManage && isOpen && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction({ kind: "close", session })}
                    >
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Encerrar
                    </Button>
                  )}
                  {canManage && ["draft", "open"].includes(session.status) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction({ kind: "cancel", session })}
                    >
                      <XCircle className="mr-1 h-4 w-4" />
                      Cancelar
                    </Button>
                  )}
                  {canManage && session.status === "draft" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction({ kind: "delete", session })}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Excluir
                    </Button>
                  )}

                  {/* Detalhes de salas e escala (visível para qualquer status) */}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                  >
                    {expandedId === session.id ? (
                      <ChevronUp className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    )}
                    Salas e escala
                  </Button>
                </div>

                {/* Painel expandido de salas e escala */}
                {expandedId === session.id && (
                  <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-3 mt-2">
                    {/* Salas da sessão */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground">Salas participantes</p>
                        {["closed", "cancelled"].includes(session.status) && (
                          <span className="text-[10px] text-muted-foreground italic">(sessão encerrada)</span>
                        )}
                      </div>

                      {session.classrooms.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Nenhuma sala adicionada a esta sessão ainda.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {session.classrooms.map((classroom) => (
                            <div
                              key={classroom.id}
                              className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs"
                            >
                              <span className="font-medium">
                                {classroom.name}
                                {classroom.capacityOverride ? ` (cap. personalizada: ${classroom.capacityOverride})` : ""}
                                <span className="text-muted-foreground font-normal ml-2">
                                  {classroom.occupied}/{classroom.effectiveCapacity} ocupados
                                </span>
                              </span>
                              {canManage && ["draft", "open"].includes(session.status) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    void run(() => removeKidSessionClassroom(classroom.id), "Sala removida")
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {canManage &&
                        ["draft", "open"].includes(session.status) &&
                        availableClassrooms(session).length > 0 && (
                          <div className="flex gap-2 pt-1">
                            <select
                              className="h-8 min-w-40 flex-1 rounded-md border bg-background px-2 text-xs"
                              value={classroomPick[session.id] ?? ""}
                              onChange={(event) =>
                                setClassroomPick({ ...classroomPick, [session.id]: event.target.value })
                              }
                            >
                              <option value="">Adicionar sala à sessão…</option>
                              {availableClassrooms(session).map((classroom) => (
                                <option key={classroom.id} value={classroom.id}>
                                  {classroom.name} ({ageRangeLabel(classroom.minAgeMonths, classroom.maxAgeMonths)})
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!classroomPick[session.id]}
                              onClick={() =>
                                void run(
                                  () =>
                                    addKidSessionClassroom({
                                      sessionId: session.id,
                                      classroomId: classroomPick[session.id],
                                      capacityOverride: null,
                                    }),
                                  "Sala adicionada",
                                  () => setClassroomPick({ ...classroomPick, [session.id]: "" }),
                                )
                              }
                            >
                              <Plus className="h-4 w-4 mr-1" /> Adicionar
                            </Button>
                          </div>
                        )}
                    </div>

                    {/* Escala de voluntários */}
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <p className="text-xs font-semibold text-foreground">Escala de voluntários</p>
                      {session.staff.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          Nenhum voluntário escalado para esta sessão.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {session.staff.map((staff) => (
                            <div
                              key={staff.id}
                              className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs"
                            >
                              <span>
                                <strong>{staff.profileName}</strong> · {ROLE_LABELS[staff.assignmentRole]}
                                {staff.classroomName ? ` · Sala: ${staff.classroomName}` : " · Geral / Recepção"}
                              </span>
                              {canManage && ["draft", "open"].includes(session.status) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    void run(() => deleteKidStaffAssignment(staff.id), "Escala removida")
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {canManage && ["draft", "open"].includes(session.status) && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <select
                            className="h-8 min-w-36 rounded-md border bg-background px-2 text-xs"
                            value={staffPick[session.id]?.profileId ?? ""}
                            onChange={(event) =>
                              setStaffPick({
                                ...staffPick,
                                [session.id]: {
                                  profileId: event.target.value,
                                  sessionClassroomId: staffPick[session.id]?.sessionClassroomId ?? "",
                                  assignmentRole: staffPick[session.id]?.assignmentRole ?? "teacher",
                                },
                              })
                            }
                          >
                            <option value="">Selecione o voluntário…</option>
                            {data.staffOptions.map((staff) => (
                              <option key={staff.id} value={staff.id}>
                                {staff.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            value={staffPick[session.id]?.sessionClassroomId ?? ""}
                            onChange={(event) =>
                              setStaffPick({
                                ...staffPick,
                                [session.id]: {
                                  profileId: staffPick[session.id]?.profileId ?? "",
                                  sessionClassroomId: event.target.value,
                                  assignmentRole: staffPick[session.id]?.assignmentRole ?? "teacher",
                                },
                              })
                            }
                          >
                            <option value="">Geral / recepção</option>
                            {session.classrooms.map((classroom) => (
                              <option key={classroom.id} value={classroom.id}>
                                {classroom.name}
                              </option>
                            ))}
                          </select>
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            value={staffPick[session.id]?.assignmentRole ?? "teacher"}
                            onChange={(event) =>
                              setStaffPick({
                                ...staffPick,
                                [session.id]: {
                                  profileId: staffPick[session.id]?.profileId ?? "",
                                  sessionClassroomId: staffPick[session.id]?.sessionClassroomId ?? "",
                                  assignmentRole: event.target.value as KidStaffRole,
                                },
                              })
                            }
                          >
                            {Object.entries(ROLE_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!staffPick[session.id]?.profileId}
                            onClick={() =>
                              void run(
                                () =>
                                  saveKidStaffAssignment({
                                    sessionId: session.id,
                                    sessionClassroomId: staffPick[session.id]?.sessionClassroomId || null,
                                    profileId: staffPick[session.id].profileId,
                                    assignmentRole: staffPick[session.id]?.assignmentRole ?? "teacher",
                                  }),
                                "Voluntário escalado",
                                () =>
                                  setStaffPick({
                                    ...staffPick,
                                    [session.id]: {
                                      profileId: "",
                                      sessionClassroomId: "",
                                      assignmentRole: "teacher",
                                    },
                                  }),
                              )
                            }
                          >
                            <Plus className="h-4 w-4 mr-1" /> Escalar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Confirmação de Ações Críticas */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "close" ? `Encerrar "${confirmAction.session.title}"?` : null}
              {confirmAction?.kind === "cancel" ? `Cancelar "${confirmAction.session.title}"?` : null}
              {confirmAction?.kind === "delete" ? `Excluir "${confirmAction.session.title}"?` : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "close"
                ? "Só é possível encerrar sem crianças presentes no momento. Sessões encerradas não aceitam novos check-ins."
                : null}
              {confirmAction?.kind === "cancel"
                ? "A sessão será marcada como cancelada e não aceitará check-in."
                : null}
              {confirmAction?.kind === "delete"
                ? "Exclusão lógica da sessão em rascunho (auditada)."
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.kind === "close" ? "" : "bg-destructive text-destructive-foreground"}
              onClick={() => {
                const action = confirmAction
                setConfirmAction(null)
                if (!action) return
                if (action.kind === "close") void run(() => closeKidSession(action.session.id), "Sessão encerrada")
                if (action.kind === "cancel") void run(() => cancelKidSession(action.session.id), "Sessão cancelada")
                if (action.kind === "delete") void run(() => deleteKidSession(action.session.id), "Sessão excluída")
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
