"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { CalendarPlus, CheckCircle2, ChevronDown, ChevronUp, DoorOpen, Play, Plus, Trash2, Users, XCircle } from "lucide-react"
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
import type { KidSessionListItem, KidSessionStatus, KidsSessionsData, KidStaffRole } from "@/lib/kids/types"

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
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
}

function toLocalInputValue(iso: string) {
  if (!iso) return ""
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
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

export function KidsSessionsTab({ data }: { data: KidsSessionsData }) {
  const router = useRouter()
  const canManage = usePermission("kids.sessions.manage")
  const [sessionForm, setSessionForm] = useState<SessionForm>(emptySessionForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [classroomPick, setClassroomPick] = useState<Record<string, string>>({})
  const [staffPick, setStaffPick] = useState<Record<string, { profileId: string; sessionClassroomId: string; assignmentRole: KidStaffRole }>>({})
  const [confirmAction, setConfirmAction] = useState<{ kind: "close" | "cancel" | "delete"; session: KidSessionListItem } | null>(null)
  const [pending, setPending] = useState(false)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    setPending(true)
    try {
      const result = await action()
      if (showResult(result)) {
        toast.success(success)
        after?.()
        router.refresh()
      }
    } finally {
      setPending(false)
    }
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
      () => setSessionForm(emptySessionForm),
    )
  }

  function startEdit(session: KidSessionListItem) {
    setSessionForm({
      id: session.id,
      title: session.title,
      congregationId: session.congregationId ?? "",
      eventId: session.eventId ?? "",
      startsAt: toLocalInputValue(session.startsAt),
      endsAt: toLocalInputValue(session.endsAt ?? ""),
      classroomIds: session.classrooms.map((classroom) => classroom.classroomId),
    })
  }

  const availableClassrooms = (session: KidSessionListItem) =>
    data.classrooms.filter((classroom) => !session.classrooms.some((sc) => sc.classroomId === classroom.id))

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {canManage && (
        <Card className="glass h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarPlus className="h-5 w-5" />{sessionForm.id ? "Editar sessão" : "Nova sessão"}</CardTitle>
            <CardDescription>Sessão representa a operação Kids em um culto ou evento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="session-title">Título *</Label>
              <Input id="session-title" placeholder="Culto domingo 19h" value={sessionForm.title} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-congregation">Congregação</Label>
              <select id="session-congregation" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={sessionForm.congregationId} onChange={(event) => setSessionForm({ ...sessionForm, congregationId: event.target.value })}>
                <option value="">Todas / sede</option>
                {data.congregations.map((congregation) => (
                  <option key={congregation.id} value={congregation.id}>{congregation.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="session-event">Evento vinculado (opcional)</Label>
              <select id="session-event" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={sessionForm.eventId} onChange={(event) => setSessionForm({ ...sessionForm, eventId: event.target.value })}>
                <option value="">Nenhum</option>
                {data.eventOptions.map((event) => (
                  <option key={event.id} value={event.id}>{event.title} · {formatDateTime(event.startsAt)}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="session-starts">Início *</Label>
                <Input id="session-starts" type="datetime-local" value={sessionForm.startsAt} onChange={(event) => setSessionForm({ ...sessionForm, startsAt: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="session-ends">Término</Label>
                <Input id="session-ends" type="datetime-local" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Salas da sessão (vazio = todas as ativas)</Label>
              <div className="grid gap-1 rounded-md border border-border/60 p-2">
                {data.classrooms.map((classroom) => (
                  <label key={classroom.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sessionForm.classroomIds.includes(classroom.id)}
                      onChange={(event) =>
                        setSessionForm({
                          ...sessionForm,
                          classroomIds: event.target.checked
                            ? [...sessionForm.classroomIds, classroom.id]
                            : sessionForm.classroomIds.filter((id) => id !== classroom.id),
                        })
                      }
                    />
                    {classroom.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={submitSession} disabled={pending || !sessionForm.title || !sessionForm.startsAt}>
                {sessionForm.id ? "Salvar alterações" : "Criar sessão"}
              </Button>
              {sessionForm.id && (
                <Button type="button" variant="outline" onClick={() => setSessionForm(emptySessionForm)}>Cancelar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3 lg:col-span-2">
        {data.sessions.length === 0 && (
          <Card className="glass">
            <CardContent className="p-0">
              <EmptyState icon={CalendarPlus} title="Nenhuma sessão" description="Crie a primeira sessão para operar o check-in infantil." />
            </CardContent>
          </Card>
        )}
        {data.sessions.map((session) => (
          <Card key={session.id} className="glass">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{session.title}</CardTitle>
                  <CardDescription>
                    {formatDateTime(session.startsAt)}
                    {session.congregationName ? ` · ${session.congregationName}` : ""}
                    {session.eventTitle ? ` · ${session.eventTitle}` : ""}
                  </CardDescription>
                </div>
                <Badge variant={STATUS_VARIANTS[session.status]}>{STATUS_LABELS[session.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="flex items-center gap-1"><Users className="h-4 w-4 text-muted-foreground" />{session.presentCount} presente(s)</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-muted-foreground" />{session.checkedOutCount} saída(s)</span>
                <span className="flex items-center gap-1"><DoorOpen className="h-4 w-4 text-muted-foreground" />capacidade {session.totalCapacity}</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {session.classrooms.map((classroom) => (
                  <Badge key={classroom.id} variant={classroom.occupied >= classroom.effectiveCapacity ? "destructive" : "outline"}>
                    {classroom.name} {classroom.occupied}/{classroom.effectiveCapacity}
                    {!classroom.isOpen ? " · fechada" : ""}
                  </Badge>
                ))}
              </div>

              {session.staff.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {session.staff.map((staff) => (
                    <Badge key={staff.id} variant="secondary">
                      {staff.profileName} · {ROLE_LABELS[staff.assignmentRole]}{staff.classroomName ? ` · ${staff.classroomName}` : ""}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {session.status === "open" && (
                  <Button type="button" size="sm" render={<Link href={`/kids/recepcao?session=${session.id}`} />}>
                    Recepção
                  </Button>
                )}
                {canManage && session.status === "draft" && (
                  <Button type="button" size="sm" onClick={() => void run(() => openKidSession(session.id), "Sessão aberta")}>
                    <Play className="mr-1 h-4 w-4" />Abrir sessão
                  </Button>
                )}
                {canManage && session.status === "draft" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(session)}>Editar</Button>
                )}
                {canManage && session.status === "open" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction({ kind: "close", session })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Encerrar
                  </Button>
                )}
                {canManage && ["draft", "open"].includes(session.status) && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction({ kind: "cancel", session })}>
                    <XCircle className="mr-1 h-4 w-4" />Cancelar
                  </Button>
                )}
                {canManage && session.status === "draft" && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmAction({ kind: "delete", session })}>
                    <Trash2 className="mr-1 h-4 w-4" />Excluir
                  </Button>
                )}
                {canManage && ["draft", "open"].includes(session.status) && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}>
                    {expandedId === session.id ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                    Salas e escala
                  </Button>
                )}
              </div>

              {expandedId === session.id && (
                <div className="space-y-3 rounded-lg border border-border/60 p-3">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Salas da sessão</p>
                    {session.classrooms.map((classroom) => (
                      <div key={classroom.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>
                          {classroom.name}
                          {classroom.capacityOverride ? ` (cap. ${classroom.capacityOverride})` : ""}
                        </span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void run(() => removeKidSessionClassroom(classroom.id), "Sala removida")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {availableClassrooms(session).length > 0 && (
                      <div className="flex gap-2">
                        <select
                          className="h-8 min-w-40 rounded-md border bg-background px-2 text-xs"
                          value={classroomPick[session.id] ?? ""}
                          onChange={(event) => setClassroomPick({ ...classroomPick, [session.id]: event.target.value })}
                        >
                          <option value="">Adicionar sala…</option>
                          {availableClassrooms(session).map((classroom) => (
                            <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!classroomPick[session.id]}
                          onClick={() =>
                            void run(
                              () => addKidSessionClassroom({ sessionId: session.id, classroomId: classroomPick[session.id], capacityOverride: null }),
                              "Sala adicionada",
                              () => setClassroomPick({ ...classroomPick, [session.id]: "" }),
                            )
                          }
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Escala de voluntários</p>
                    {session.staff.map((staff) => (
                      <div key={staff.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{staff.profileName} · {ROLE_LABELS[staff.assignmentRole]}{staff.classroomName ? ` · ${staff.classroomName}` : " · geral"}</span>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => void run(() => deleteKidStaffAssignment(staff.id), "Escala removida")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="h-8 min-w-36 rounded-md border bg-background px-2 text-xs"
                        value={staffPick[session.id]?.profileId ?? ""}
                        onChange={(event) => setStaffPick({ ...staffPick, [session.id]: { profileId: event.target.value, sessionClassroomId: staffPick[session.id]?.sessionClassroomId ?? "", assignmentRole: staffPick[session.id]?.assignmentRole ?? "teacher" } })}
                      >
                        <option value="">Voluntário…</option>
                        {data.staffOptions.map((staff) => (
                          <option key={staff.id} value={staff.id}>{staff.name}</option>
                        ))}
                      </select>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={staffPick[session.id]?.sessionClassroomId ?? ""}
                        onChange={(event) => setStaffPick({ ...staffPick, [session.id]: { profileId: staffPick[session.id]?.profileId ?? "", sessionClassroomId: event.target.value, assignmentRole: staffPick[session.id]?.assignmentRole ?? "teacher" } })}
                      >
                        <option value="">Geral / recepção</option>
                        {session.classrooms.map((classroom) => (
                          <option key={classroom.id} value={classroom.id}>{classroom.name}</option>
                        ))}
                      </select>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={staffPick[session.id]?.assignmentRole ?? "teacher"}
                        onChange={(event) => setStaffPick({ ...staffPick, [session.id]: { profileId: staffPick[session.id]?.profileId ?? "", sessionClassroomId: staffPick[session.id]?.sessionClassroomId ?? "", assignmentRole: event.target.value as KidStaffRole } })}
                      >
                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
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
                            () => setStaffPick({ ...staffPick, [session.id]: { profileId: "", sessionClassroomId: "", assignmentRole: "teacher" } }),
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "close" ? `Encerrar "${confirmAction.session.title}"?` : null}
              {confirmAction?.kind === "cancel" ? `Cancelar "${confirmAction.session.title}"?` : null}
              {confirmAction?.kind === "delete" ? `Excluir "${confirmAction.session.title}"?` : null}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "close" ? "Só é possível encerrar sem crianças presentes. Sessões encerradas não aceitam check-in." : null}
              {confirmAction?.kind === "cancel" ? "A sessão será marcada como cancelada e não aceitará check-in." : null}
              {confirmAction?.kind === "delete" ? "Exclusão lógica da sessão em rascunho (auditada)." : null}
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
