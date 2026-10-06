"use client"

import { Children, useId, cloneElement, isValidElement, useState, useSyncExternalStore, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Grid2X2, List, Activity, AlertTriangle, BarChart3, Check, ClipboardCheck, Download, FileText, HeartHandshake, Megaphone, Pencil, Plus, Save, Search, Settings2, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeader } from "@/components/shared/section-header"
import { ViewToggle } from "@/components/shared/view-toggle"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { addMinistryMember, createMinistryCommunication, generateMinistryScale, listMinistryScaleCandidates, previewMinistryCommunicationMedia, publishMinistryScale, recordMinistryAttendance, removeMinistryActivity, removeMinistryAttendance, removeMinistryCommunication, removeMinistryScale, removeMinistryTeam, removeMinistryResource, reviewMinistryMember, saveMinistryActivity, saveMinistryProfile, saveMinistryResource, saveMinistryScaleAssignment, saveMinistryScalePositions, saveMinistryTeam, saveMinistryTeamMember, uploadMinistryCommunicationMedia, uploadMinistryResource } from "@/lib/ministries/actions"
import type { ActionResult } from "@/lib/ministries/actions"
import type { MinistryScaleCandidate, MinistryWorkspaceData } from "@/lib/ministries/types"
import { MessageEditor } from "@/components/automations/message-editor"
import type { AutomationMessage } from "@/lib/automations/contract"

type PeopleView = "list" | "grid"
const PEOPLE_VIEW_KEY = "altar-church:ministry-people-view:v1"
const PEOPLE_VIEW_EVENT = "ministry-people-view-change"
let peopleViewFallback: PeopleView = "list"
function subscribePeopleView(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(PEOPLE_VIEW_EVENT, callback)
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(PEOPLE_VIEW_EVENT, callback) }
}
function getPeopleView(): PeopleView {
  try { return window.localStorage.getItem(PEOPLE_VIEW_KEY) === "grid" ? "grid" : "list" } catch { return peopleViewFallback }
}
function getServerPeopleView(): PeopleView { return "list" }
function setPeopleView(value: PeopleView) {
  peopleViewFallback = value
  try { window.localStorage.setItem(PEOPLE_VIEW_KEY, value) } catch { /* Keep the preference for this session when storage is unavailable. */ }
  window.dispatchEvent(new Event(PEOPLE_VIEW_EVENT))
}

type ScalesView = "list" | "grid"
const SCALES_VIEW_KEY = "altar-church:ministry-scales-view:v1"
const SCALES_VIEW_EVENT = "ministry-scales-view-change"
let scalesViewFallback: ScalesView = "list"
function subscribeScalesView(callback: () => void) {
  window.addEventListener("storage", callback)
  window.addEventListener(SCALES_VIEW_EVENT, callback)
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(SCALES_VIEW_EVENT, callback) }
}
function getScalesView(): ScalesView {
  try { return window.localStorage.getItem(SCALES_VIEW_KEY) === "grid" ? "grid" : "list" } catch { return scalesViewFallback }
}
function getServerScalesView(): ScalesView { return "list" }
function setScalesView(value: ScalesView) {
  scalesViewFallback = value
  try { window.localStorage.setItem(SCALES_VIEW_KEY, value) } catch { /* Keep the preference for this session when storage is unavailable. */ }
  window.dispatchEvent(new Event(SCALES_VIEW_EVENT))
}

function personInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("pt-BR") || "?"
}

function WorkspaceDialog({ open, onOpenChange, title, description, pending, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; pending: boolean; children: ReactNode
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="min-w-0 sm:max-w-2xl" showCloseButton={!pending}>
      <DialogHeader className="pr-8"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <fieldset disabled={pending} aria-busy={pending} className="min-w-0 space-y-4 [&_form]:min-w-0 [&_input]:min-w-0 [&_[data-slot=select-trigger]]:w-full">{children}</fieldset>
      <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>Cancelar</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

const DAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
const TEAM_ROLE_LABELS = {
  member: "Membro",
  leader: "Líder",
  co_leader: "Co-líder",
  host: "Anfitrião",
}
const MEMBER_STATUS_LABELS = {
  pending: "Pendente",
  active: "Ativo",
  rejected: "Rejeitado",
  inactive: "Inativo",
}
const SCALE_STATUS_LABELS = {
  draft: "Sem funções",
  incomplete: "Incompleta",
  ready: "Pronta",
  published: "Publicada",
}
const COMMUNICATION_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  queued: "Na fila",
  processing: "Processando",
  completed: "Enviada ao provedor",
  failed: "Falhou",
  canceled: "Cancelada",
}

type TeamForm = {
  id: string
  name: string
  description: string
  leaderPersonId: string
  coLeaderPersonId: string
  coordinatorPersonId: string
  meetingDay: string
  meetingTime: string
  meetingLocation: string
  maxCapacity: string
  isActive: boolean
}

type ScalePositionForm = {
  roleName: string
  requiredVolunteers: string
  instructions: string
}

const emptyTeamForm: TeamForm = {
  id: "",
  name: "",
  description: "",
  leaderPersonId: "",
  coLeaderPersonId: "",
  coordinatorPersonId: "",
  meetingDay: "",
  meetingTime: "",
  meetingLocation: "",
  maxCapacity: "0",
  isActive: true,
}

function Stat({ label, value, tone = "primary" }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="py-0 shadow-none">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${({ primary: "text-primary", "amber-600": "text-amber-600", "blue-600": "text-blue-600", "green-600": "text-green-600", "violet-600": "text-violet-600" } as Record<string, string>)[tone] ?? "text-primary"}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function labelFieldControls(children: ReactNode, id: string, helpId?: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement<{ children?: ReactNode; id?: string; "aria-describedby"?: string }>(child)) return child
    if (child.type === Input || child.type === Textarea || child.type === SelectTrigger) {
      return cloneElement(child, { id, "aria-describedby": helpId })
    }
    return child.props.children ? cloneElement(child, { children: labelFieldControls(child.props.children, id, helpId) }) : child
  })
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {labelFieldControls(children, id, help ? `${id}-help` : undefined)}
      {help && <p id={`${id}-help`} className="text-xs leading-relaxed text-muted-foreground">{help}</p>}
    </div>
  )
}

function toTimeInput(value: string | null | undefined) {
  return value ? value.slice(0, 5) : ""
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

function roleLabel(role: string) {
  return role === "leader" ? "Líder" : role === "coordinator" ? "Coordenador" : "Membro"
}

export function MinistryWorkspace({ data, initialTab = "visao-geral", memberPortal = false }: { data: MinistryWorkspaceData; initialTab?: string; memberPortal?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { workspace } = data
  const profile = workspace.profile
  const canManage = workspace.canManage
  const isAdmin = ["superadmin", "admin", "pastor"].includes(workspace.actorRole)
  const activeMembers = data.members.filter((member) => member.status === "active")

  const [activeTab, setActiveTab] = useState(initialTab)
  const [peopleSearch, setPeopleSearch] = useState("")
  const [addPeopleSearch, setAddPeopleSearch] = useState("")
  const [peopleStatus, setPeopleStatus] = useState("all")
  const peopleView = useSyncExternalStore(subscribePeopleView, getPeopleView, getServerPeopleView)
  const scalesView = useSyncExternalStore(subscribeScalesView, getScalesView, getServerScalesView)
  const memberPhotoById = new Map(data.members.map((member) => [member.personId, member.photoUrl]))
  const [dialog, setDialog] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ label: string; run: () => void } | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState("")
  const [profileForm, setProfileForm] = useState({
    name: profile.name,
    slug: profile.slug || "",
    ministryType: profile.ministryType,
    mission: profile.mission,
    description: profile.description,
    targetAudience: profile.targetAudience,
    contact: profile.contact,
    leaderPersonId: profile.leaderPersonId ?? "",
    meetingDay: profile.meetingDay === null ? "" : String(profile.meetingDay),
    meetingTime: toTimeInput(profile.meetingTime),
    meetingLocation: profile.meetingLocation,
    publicJoinEnabled: profile.publicJoinEnabled,
    isActive: profile.isActive,
  })
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm)
  const [teamMember, setTeamMember] = useState({
    groupId: data.teams.find((team) => team.isActive)?.id ?? "",
    personId: activeMembers[0]?.personId ?? "",
    role: "member" as "member" | "leader" | "co_leader" | "host",
  })
  const [activityForm, setActivityForm] = useState({
    id: "",
    title: "",
    description: "",
    startsAt: "",
    durationMinutes: "60",
    kind: "meeting",
    location: "",
    recurrenceFrequency: "none",
    recurrenceWeekdays: [] as number[],
  })
  const [scaleEventId, setScaleEventId] = useState(data.agenda[0]?.id ?? "")
  const [scalePositions, setScalePositions] = useState<ScalePositionForm[]>([{ roleName: "", requiredVolunteers: "1", instructions: "" }])
  const [scaleCandidates, setScaleCandidates] = useState<Record<string, { loading: boolean; items: MinistryScaleCandidate[] }>>({})
  const [communicationSearch, setCommunicationSearch] = useState("")
  const [communicationForm, setCommunicationForm] = useState({
    title: "",
    content: "",
    method: "push" as "push" | "email" | "whatsapp",
    audience: "ministry" as "ministry" | "team" | "manual",
    audienceRefId: data.teams.find((team) => team.isActive)?.id ?? "",
    personIds: [] as string[],
  })
  const [whatsappMessage, setWhatsappMessage] = useState<AutomationMessage>({ type: "text", text: "" })
  const [attendanceForm, setAttendanceForm] = useState({
    eventId: data.agenda[0]?.id ?? "",
    personId: activeMembers[0]?.personId ?? "",
    status: "present" as "present" | "absent" | "justified",
  })
  const [resourceForm, setResourceForm] = useState({
    title: "",
    description: "",
    category: "geral",
    externalUrl: "",
    visibility: "members" as "leaders" | "members" | "public",
    sortOrder: "0",
  })

  function run(task: () => Promise<ActionResult>, success: string) {
    startTransition(async () => {
      try {
        const result = await task()
        if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
        else {
          toast.success(success)
          if (dialog) setDialog(null)
          router.refresh()
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível concluir")
      }
    })
  }

  function runFormData(formData: FormData, success: string) {
    startTransition(async () => {
      try {
        const result = await uploadMinistryResource(formData)
        if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
        else {
          toast.success(success)
          if (dialog) setDialog(null)
          router.refresh()
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível concluir")
      }
    })
  }

  function confirmRemoval(label: string, run: () => void) {
    setConfirmDelete({ label, run })
  }

  function uploadCommunicationMedia(form: FormData) {
    form.set("ministryId", profile.id)
    return uploadMinistryCommunicationMedia(form)
  }

  function loadCommunicationMediaPreview(fileId: string) {
    return previewMinistryCommunicationMedia({ ministryId: profile.id, fileId })
  }

  const normalizedPeopleSearch = peopleSearch.trim().toLocaleLowerCase("pt-BR")
  const normalizedAddPeopleSearch = addPeopleSearch.trim().toLocaleLowerCase("pt-BR")
  const filteredMembers = data.members.filter((member) => (peopleStatus === "all" || member.status === peopleStatus) && (!normalizedPeopleSearch || `${member.personName} ${member.email} ${member.phone}`.toLocaleLowerCase("pt-BR").includes(normalizedPeopleSearch)))
  const normalizedCommunicationSearch = communicationSearch.trim().toLocaleLowerCase("pt-BR")
  const communicationPeople = activeMembers.filter((member) => !normalizedCommunicationSearch || `${member.personName} ${member.email} ${member.phone}`.toLocaleLowerCase("pt-BR").includes(normalizedCommunicationSearch))
  const setWeekday = (day: number) =>
    setActivityForm((current) => ({
      ...current,
      recurrenceWeekdays: current.recurrenceWeekdays.includes(day) ? current.recurrenceWeekdays.filter((item) => item !== day) : [...current.recurrenceWeekdays, day].sort(),
    }))

  function editTeam(team: (typeof data.teams)[number]) {
    setDialog("team")
    setTeamForm({
      id: team.id,
      name: team.name,
      description: team.description,
      leaderPersonId: team.leaderPersonId ?? "",
      coLeaderPersonId: team.coLeaderPersonId ?? "",
      coordinatorPersonId: team.coordinatorPersonId ?? "",
      meetingDay: team.meetingDay,
      meetingTime: toTimeInput(team.meetingTime),
      meetingLocation: team.meetingLocation,
      maxCapacity: String(team.maxCapacity),
      isActive: team.isActive,
    })
  }

  function editActivity(activity: (typeof data.agenda)[number]) {
    if (!activity.programmingId) return
    setDialog("activity")
    setActivityForm({
      id: activity.programmingId,
      title: activity.title,
      description: activity.description,
      startsAt: toDateTimeLocal(activity.programmingStartsAt),
      durationMinutes: String(activity.durationMinutes),
      kind: "meeting",
      location: activity.location,
      recurrenceFrequency: activity.recurrenceFrequency,
      recurrenceWeekdays: activity.recurrenceWeekdays,
    })
  }

  function toggleCommunicationPerson(personId: string) {
    setCommunicationForm((current) => ({
      ...current,
      personIds: current.personIds.includes(personId) ? current.personIds.filter((id) => id !== personId) : [...current.personIds, personId],
    }))
  }

  function loadScaleCandidates(shiftId: string) {
    setScaleCandidates((current) => ({
      ...current,
      [shiftId]: { loading: true, items: current[shiftId]?.items ?? [] },
    }))
    startTransition(async () => {
      const result = await listMinistryScaleCandidates({
        ministryId: profile.id,
        shiftId,
      })
      if (!result.ok) toast.error(result.error ?? "Não foi possível listar candidatos")
      else
        setScaleCandidates((current) => ({
          ...current,
          [shiftId]: {
            loading: false,
            items: (result.data as MinistryScaleCandidate[] | undefined) ?? [],
          },
        }))
    })
  }

  return (
    <div className="min-w-0 space-y-5 [&_[data-slot=card]]:min-w-0 [&_[data-slot=card-content]]:min-w-0 [&_[data-slot=card-title]]:text-base [&_[data-slot=card-content]]:break-words">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <HeartHandshake className="mr-1 h-3 w-3" />
              Gestão do ministério
            </Badge>
            <Badge>{profile.isActive ? "Ativo" : "Inativo"}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{profile.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{profile.mission || profile.description || "Centro operacional do ministério."}</p>
        </div>
        <Button variant="outline" onClick={() => router.push(memberPortal ? "/membro/ministerios" : "/ministerios")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Membros ativos" value={workspace.indicators.activeMembers} />
        <Stat label="Pendentes" value={workspace.indicators.pendingMembers} tone="amber-600" />
        <Stat label="Equipes" value={workspace.indicators.activeTeams} />
        <Stat label="Vagas" value={workspace.indicators.openTeamSlots} tone="blue-600" />
        <Stat label="Próximas atividades" value={workspace.indicators.upcomingActivities} />
        <Stat label="Presença 30d" value={workspace.indicators.attendancePresent30d} tone="green-600" />
        <Stat label="Escalas incompletas" value={workspace.indicators.incompleteScales} tone="amber-600" />
        <Stat label="Acompanhamentos abertos" value={workspace.indicators.openFollowUps} tone="violet-600" />
      </div>

      {workspace.alerts.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {workspace.alerts.map((alert) => (
            <button key={alert.kind} type="button" onClick={() => setActiveTab(alert.href.replace(/^#/, ""))} className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="flex-1">{alert.label}</span>
              <Badge variant="outline">{alert.count}</Badge>
            </button>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList aria-label="Gestão do ministério" className="w-full flex-nowrap justify-start overflow-x-auto rounded-xl border bg-muted/50 p-1 [&_[role=tab]]:min-h-11 [&_[role=tab]]:px-3">
          <TabsTrigger value="visao-geral">
            <BarChart3 />
            Visão geral
          </TabsTrigger>
          <TabsTrigger value="pessoas">
            <Users />
            Pessoas
          </TabsTrigger>
          <TabsTrigger value="equipes">
            <Users />
            Equipes
          </TabsTrigger>
          <TabsTrigger value="agenda">
            <Activity />
            Agenda
          </TabsTrigger>
          <TabsTrigger value="escalas">
            <ClipboardCheck />
            Escalas
          </TabsTrigger>
          <TabsTrigger value="comunicacao">
            <Megaphone />
            Comunicação
          </TabsTrigger>
          <TabsTrigger value="recursos">
            <FileText />
            Recursos
          </TabsTrigger>
          <TabsTrigger value="relatorios">
            <BarChart3 />
            Relatórios
          </TabsTrigger>
          <TabsTrigger value="configuracoes">
            <Settings2 />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-4">
<SectionHeader title="Visão geral" description="Acompanhe as atividades e a participação do ministério." />
          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Próximas atividades</CardTitle>
                <CardDescription>Atividades do ministério e situação da escala.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.activities.length ? (
                  workspace.activities.slice(0, 8).map((activity) => (
                    <div key={activity.id} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="min-w-0 flex-1 break-words">
                        <p className="font-medium">{activity.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(activity.startsAt)} · {activity.location || "Local não informado"}
                        </p>
                      </div>
                      <Badge variant={activity.scaleComplete ? "default" : "destructive"}>{activity.volunteerPositions ? `${activity.assignedVolunteers}/${activity.volunteerPositions}` : "Sem escala"}</Badge>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={Activity} className="py-8" title="Nenhuma atividade cadastrada" description="Organize os próximos encontros na Agenda do ministério." action={<Button variant="outline" onClick={() => setActiveTab("agenda")}>Ver Agenda</Button>} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Presença — últimos 30 dias</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {workspace.attendance.length ? (
                  workspace.attendance.slice(-10).map((day) => (
                    <div key={day.day} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-24 text-muted-foreground">{new Date(day.day).toLocaleDateString("pt-BR")}</span>
                      <span className="text-green-600">{day.present} presentes</span>
                      <span className="text-red-600">{day.absent} ausentes</span>
                      <span className="text-amber-600">{day.justified} justificadas</span>
                    </div>
                  ))
                ) : (
                  <EmptyState icon={ClipboardCheck} className="py-8" title="Sem registros de presença" description="As presenças registradas nas atividades aparecerão aqui." action={canManage ? <Button variant="outline" onClick={() => setActiveTab("escalas")}>Ver Escalas</Button> : undefined} />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pessoas" className="space-y-4">
<SectionHeader title="Pessoas" description="Gerencie os membros e as solicitações de participação." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("person") }}><Plus className="h-4 w-4" />Adicionar pessoa</Button>}</>} />
          <div className="grid grid-cols-1 gap-4">
            <WorkspaceDialog open={dialog === "person"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Adicionar pessoa"} description="A pessoa precisa já existir em Pessoas. Isso apenas cria o vínculo ativo com este ministério." pending={pending}>

                <Field label="Buscar pessoa" help="Pesquise por nome, e-mail ou telefone.">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Ex.: Ana ou (11) 99999-0000" value={addPeopleSearch} onChange={(event) => setAddPeopleSearch(event.target.value)} />
                  </div>
                </Field>
                <Field label="Pessoa cadastrada">
                  <Select value={selectedPersonId || "none"} onValueChange={(value) => setSelectedPersonId(value === "none" ? "" : (value ?? ""))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma pessoa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecione uma pessoa</SelectItem>
                      {data.people
                        .filter((person) => !normalizedAddPeopleSearch || `${person.fullName} ${person.email} ${person.phone}`.toLocaleLowerCase("pt-BR").includes(normalizedAddPeopleSearch))
                        .map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.fullName}
                            {person.membershipStatus === "active" ? " · já é membro" : person.membershipStatus === "pending" ? " · pendente" : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button
                  className="w-full"
                  disabled={pending || !canManage || !selectedPersonId}
                  onClick={() =>
                    run(async () => {
                      const result = await addMinistryMember({
                        ministryId: profile.id,
                        personId: selectedPersonId,
                      })
                      if (result.ok) setSelectedPersonId("")
                      return result
                    }, "Pessoa adicionada ao ministério")
                  }
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Adicionar pessoa
                </Button>
                <p className="text-xs text-muted-foreground">Para cadastrar alguém novo, use a aba Pessoas da igreja e depois volte aqui.</p>

</WorkspaceDialog>
            <Card>
              <CardHeader>
                <CardTitle>Pessoas e solicitações</CardTitle>
                <CardDescription>{data.members.length} vínculos encontrados. Use a busca para localizar rapidamente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" aria-label="Buscar membros" placeholder="Filtrar membros por nome, e-mail ou telefone" value={peopleSearch} onChange={(event) => setPeopleSearch(event.target.value)} />
                </div>
 <Select value={peopleStatus} onValueChange={(value) => setPeopleStatus(value ?? "all")}><SelectTrigger aria-label="Situação dos membros" className="w-full lg:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as situações</SelectItem>{Object.entries(MEMBER_STATUS_LABELS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
 <ViewToggle value={peopleView} onChange={setPeopleView} showLabel className="[&_[aria-pressed=true]]:bg-primary [&_[aria-pressed=true]]:text-primary-foreground" options={[{ value: "list", label: "Lista", icon: List }, { value: "grid", label: "Grade", icon: Grid2X2 }]} />
 </div><p className="text-xs text-muted-foreground" role="status">{filteredMembers.length} de {data.members.length} pessoas</p>
                <div className={peopleView === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"} data-people-view={peopleView}>
{filteredMembers.map((member) => (
                  <div key={member.id} className={peopleView === "grid" ? "flex min-w-0 flex-col gap-4 rounded-xl border bg-background p-4" : "flex min-w-0 flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center"}>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar className={peopleView === "grid" ? "size-12 shrink-0 border border-border/60" : "size-10 shrink-0 border border-border/60"}>
                        {member.photoUrl && <AvatarImage src={member.photoUrl} alt={member.personName} />}
                        <AvatarFallback>{member.personName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toLocaleUpperCase("pt-BR") || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 break-words">
                        <p className="font-medium">{member.personName}</p>
                        <p className="text-xs text-muted-foreground">
                          {[member.email, member.phone].filter(Boolean).join(" · ") || "Sem contato"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{member.teamNames.length ? member.teamNames.join(", ") : "Sem equipe"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={member.status === "active" ? "default" : member.status === "pending" ? "outline" : "secondary"}>{member.status === "active" ? roleLabel(member.role) : MEMBER_STATUS_LABELS[member.status]}</Badge>
                      {member.hasPortal && <Badge variant="outline">Portal</Badge>}
                      {member.status === "pending" && canManage && (
                        <>
                          <Button
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () =>
                                  reviewMinistryMember({
                                    ministryId: profile.id,
                                    membershipId: member.id,
                                    decision: "approve",
                                  }),
                                "Membro aprovado",
                              )
                            }
                          >
                            <Check className="mr-1 h-4 w-4" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              run(
                                () =>
                                  reviewMinistryMember({
                                    ministryId: profile.id,
                                    membershipId: member.id,
                                    decision: "reject",
                                  }),
                                "Solicitação rejeitada",
                              )
                            }
                          >
                            <X className="mr-1 h-4 w-4" />
                            Rejeitar
                          </Button>
                        </>
                      )}
                      {member.status === "inactive" && canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                reviewMinistryMember({
                                  ministryId: profile.id,
                                  membershipId: member.id,
                                  decision: "reactivate",
                                }),
                              "Membro reativado",
                            )
                          }
                        >
                          Reativar
                        </Button>
                      )}
                      {member.status === "active" && canManage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => confirmRemoval(`${member.personName} do ministério`, () => run(
                              () =>
                                reviewMinistryMember({
                                  ministryId: profile.id,
                                  membershipId: member.id,
                                  decision: "remove",
                                }),
                              "Pessoa removida do ministério",
                            ))
                          }
                        >
                          <UserMinus className="mr-1 h-3.5 w-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                </div>
 {filteredMembers.length === 0 && <EmptyState icon={Users} title={data.members.length ? "Nenhuma pessoa encontrada" : "Seu ministério ainda não tem membros"} description={data.members.length ? "Tente outro nome, contato ou situação." : "Adicione pessoas já cadastradas na igreja ou acompanhe as solicitações de participação."} action={data.members.length ? <Button variant="outline" onClick={() => { setPeopleSearch(""); setPeopleStatus("all") }}>Limpar filtros</Button> : canManage ? <Button onClick={() => setDialog("person")}>Adicionar pessoa</Button> : undefined} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="equipes" className="space-y-4">
<SectionHeader title="Equipes" description="Organize os membros, a liderança e os encontros." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("teamMember") }}><Plus className="h-4 w-4" />Adicionar à equipe</Button>}{canManage && <Button type="button" disabled={pending} onClick={() => { setTeamForm(emptyTeamForm); setDialog("team") }}><Plus className="h-4 w-4" />Criar equipe</Button>}</>} />
          <div className="grid grid-cols-1 gap-4">
            <WorkspaceDialog open={dialog === "team"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={teamForm.id ? "Editar equipe" : "Criar equipe"} description="Organize a liderança, os encontros e a capacidade da equipe." pending={pending}>

                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    run(
                      async () => {
                        const result = await saveMinistryTeam({
                          ministryId: profile.id,
                          id: teamForm.id || null,
                          name: teamForm.name,
                          description: teamForm.description,
                          leaderPersonId: teamForm.leaderPersonId || null,
                          coLeaderPersonId: teamForm.coLeaderPersonId || null,
                          coordinatorPersonId: teamForm.coordinatorPersonId || null,
                          meetingDay: teamForm.meetingDay,
                          meetingTime: teamForm.meetingTime || null,
                          meetingLocation: teamForm.meetingLocation,
                          maxCapacity: Number(teamForm.maxCapacity),
                          isActive: teamForm.isActive,
                        })
                        if (result.ok) setTeamForm(emptyTeamForm)
                        return result
                      },
                      teamForm.id ? "Equipe atualizada" : "Equipe criada",
                    )
                  }}
                >
                  <Field label="Nome da equipe" help="Ex.: Recepção do domingo ou Intercessão.">
                    <Input required placeholder="Nome claro da equipe" value={teamForm.name} onChange={(event) => setTeamForm({ ...teamForm, name: event.target.value })} />
                  </Field>
                  <Field label="Para que esta equipe existe?" help="Explique rapidamente a responsabilidade da equipe.">
                    <Textarea
                      placeholder="Descrição da função da equipe"
                      value={teamForm.description}
                      onChange={(event) =>
                        setTeamForm({
                          ...teamForm,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Líder">
                      <Select
                        value={teamForm.leaderPersonId || "none"}
                        onValueChange={(value) =>
                          setTeamForm({
                            ...teamForm,
                            leaderPersonId: value === "none" ? "" : (value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem líder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem líder</SelectItem>
                          {activeMembers.map((member) => (
                            <SelectItem key={member.personId} value={member.personId}>
                              {member.personName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Co-líder">
                      <Select
                        value={teamForm.coLeaderPersonId || "none"}
                        onValueChange={(value) =>
                          setTeamForm({
                            ...teamForm,
                            coLeaderPersonId: value === "none" ? "" : (value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sem co-líder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem co-líder</SelectItem>
                          {activeMembers.map((member) => (
                            <SelectItem key={member.personId} value={member.personId}>
                              {member.personName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Coordenador">
                    <Select
                      value={teamForm.coordinatorPersonId || "none"}
                      onValueChange={(value) =>
                        setTeamForm({
                          ...teamForm,
                          coordinatorPersonId: value === "none" ? "" : (value ?? ""),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sem coordenador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem coordenador</SelectItem>
                        {activeMembers.map((member) => (
                          <SelectItem key={member.personId} value={member.personId}>
                            {member.personName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Dia do encontro" help="Ex.: sábado ou domingo.">
                      <Input
                        placeholder="Ex.: sábado"
                        value={teamForm.meetingDay}
                        onChange={(event) =>
                          setTeamForm({
                            ...teamForm,
                            meetingDay: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Horário" help="Ex.: 18:00.">
                      <Input
                        type="time"
                        value={teamForm.meetingTime}
                        onChange={(event) =>
                          setTeamForm({
                            ...teamForm,
                            meetingTime: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Local" help="Informe sala, prédio ou endereço.">
                    <Input
                      placeholder="Ex.: Sala 3"
                      value={teamForm.meetingLocation}
                      onChange={(event) =>
                        setTeamForm({
                          ...teamForm,
                          meetingLocation: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Capacidade" help="Use 0 para não limitar a quantidade de pessoas.">
                    <Input
                      type="number"
                      min="0"
                      max="10000"
                      value={teamForm.maxCapacity}
                      onChange={(event) =>
                        setTeamForm({
                          ...teamForm,
                          maxCapacity: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={teamForm.isActive}
                      onChange={(event) =>
                        setTeamForm({
                          ...teamForm,
                          isActive: event.target.checked,
                        })
                      }
                    />
                    Equipe ativa
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={pending || !canManage}>
                      <Save className="mr-2 h-4 w-4" />
                      {teamForm.id ? "Salvar alterações" : "Criar equipe"}
                    </Button>
                  </div>
                </form>

</WorkspaceDialog>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Equipes do ministério</CardTitle>
                  <CardDescription>0 de capacidade significa “Sem limite”. Inativar a equipe preserva o histórico.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.teams.map((team) => {
                    const teamMembers = data.teamMembers.filter((member) => member.groupId === team.id)
                    return (
                      <div key={team.id} className="rounded-xl border p-3">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{team.name}</p>
                              <Badge variant={team.isActive ? "default" : "secondary"}>{team.isActive ? "Ativa" : "Inativa"}</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Líder: {team.leaderName || "não definido"} · Co-líder: {team.coLeaderName || "não definido"} · Coordenador: {team.coordinatorName || "não definido"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {team.meetingDay || "Dia não informado"}
                              {team.meetingTime ? ` às ${toTimeInput(team.meetingTime)}` : ""} · {team.meetingLocation || "Local não informado"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {team.memberCount}/{team.maxCapacity ? team.maxCapacity : "Sem limite"} pessoas
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="outline" disabled={!canManage} onClick={() => editTeam(team)}>
                              <Pencil className="mr-1 h-3.5 w-3.5" />
                              Editar
                            </Button>
                            {team.isActive && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!canManage || pending}
                                onClick={() =>
                                  run(
                                    () =>
                                      saveMinistryTeam({
                                        ministryId: profile.id,
                                        id: team.id,
                                        name: team.name,
                                        description: team.description,
                                        leaderPersonId: team.leaderPersonId,
                                        coLeaderPersonId: team.coLeaderPersonId,
                                        coordinatorPersonId: team.coordinatorPersonId,
                                        meetingDay: team.meetingDay,
                                        meetingTime: team.meetingTime,
                                        meetingLocation: team.meetingLocation,
                                        maxCapacity: team.maxCapacity,
                                        isActive: false,
                                      }),
                                    "Equipe inativada",
                                  )
                                }
                              >
                                <UserMinus className="mr-1 h-3.5 w-3.5" />
                                Inativar
                              </Button>
                            )}
                            {canManage && (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={pending}
                                aria-label={`Excluir equipe ${team.name}`}
                                onClick={() => confirmRemoval(`a equipe ${team.name}`, () => run(
                                    () => removeMinistryTeam({ ministryId: profile.id, teamId: team.id }),
                                    "Equipe excluída",
                                  ))
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 border-t pt-3">
                          <p className="mb-2 text-sm font-medium">Membros ({teamMembers.length})</p>
                          {teamMembers.length ? (
                            <div className="space-y-2">
                              {teamMembers.map((member) => (
                                <div key={member.id} className="flex items-center gap-2 text-sm">
                                  <span className="min-w-0 flex-1 truncate">{member.personName}</span>
                                  <Badge variant="outline">{TEAM_ROLE_LABELS[member.role]}</Badge>
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    disabled={!canManage || pending}
                                    aria-label={`Remover ${member.personName}`}
                                    onClick={() =>
                                      run(
                                        () =>
                                          saveMinistryTeamMember({
                                            ministryId: profile.id,
                                            groupId: team.id,
                                            personId: member.personId,
                                            role: member.role,
                                            remove: true,
                                          }),
                                        "Pessoa removida da equipe",
                                      )
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Nenhuma pessoa adicionada a esta equipe.</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {data.teams.length === 0 && <EmptyState icon={Users} title="Nenhuma equipe criada" description="Crie uma equipe para organizar os membros." action={canManage ? <Button onClick={() => setDialog("team")}>Criar equipe</Button> : undefined} />}
                  <WorkspaceDialog open={dialog === "teamMember"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Adicionar pessoa à equipe"} description="Selecione uma equipe, um membro ativo e sua função." pending={pending}>
<div className="space-y-3">
                    <p className="mb-2 text-sm font-medium">Adicionar pessoa a uma equipe</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Equipe"><Select
                        value={teamMember.groupId || "none"}
                        onValueChange={(value) =>
                          setTeamMember({
                            ...teamMember,
                            groupId: value === "none" ? "" : (value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Equipe" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Equipe</SelectItem>
                          {data.teams
                            .filter((team) => team.isActive)
                            .map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                {team.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select></Field>
                      <Field label="Pessoa"><Select
                        value={teamMember.personId || "none"}
                        onValueChange={(value) =>
                          setTeamMember({
                            ...teamMember,
                            personId: value === "none" ? "" : (value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pessoa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Pessoa ativa</SelectItem>
                          {activeMembers.map((member) => (
                            <SelectItem key={member.personId} value={member.personId}>
                              {member.personName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select></Field>
                      <Field label="Função na equipe"><Select
                        value={teamMember.role}
                        onValueChange={(value) =>
                          setTeamMember({
                            ...teamMember,
                            role: (value ?? "member") as typeof teamMember.role,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TEAM_ROLE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select></Field>
                      <Button
                        type="button"
                        disabled={pending || !canManage || !teamMember.groupId || !teamMember.personId}
                        onClick={() =>
                          run(
                            () =>
                              saveMinistryTeamMember({
                                ministryId: profile.id,
                                groupId: teamMember.groupId,
                                personId: teamMember.personId,
                                role: teamMember.role,
                              }),
                            "Pessoa adicionada à equipe",
                          )
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Adicionar
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">A pessoa precisa estar ativa no ministério. Remover da equipe não remove do ministério.</p>
                  </div>
</WorkspaceDialog>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-4">
<SectionHeader title="Agenda" description="Planeje as próximas atividades do ministério." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setActivityForm({ id: "", title: "", description: "", startsAt: "", durationMinutes: "60", kind: "meeting", location: "", recurrenceFrequency: "none", recurrenceWeekdays: [] }); setDialog("activity") }}><Plus className="h-4 w-4" />Nova atividade</Button>}</>} />
          <div className="grid grid-cols-1 gap-4">
            <WorkspaceDialog open={dialog === "activity"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={activityForm.id ? "Editar atividade" : "Nova atividade"} description="Defina os detalhes da atividade e depois organize a escala." pending={pending}>

                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    run(
                      () =>
                        saveMinistryActivity({
                          ministryId: profile.id,
                          id: activityForm.id || undefined,
                          title: activityForm.title,
                          description: activityForm.description,
                          startsAt: new Date(activityForm.startsAt).toISOString(),
                          durationMinutes: Number(activityForm.durationMinutes),
                          kind: activityForm.kind as "meeting",
                          location: activityForm.location,
                          recurrenceFrequency: activityForm.recurrenceFrequency as "none" | "weekly" | "monthly",
                          recurrenceWeekdays: activityForm.recurrenceWeekdays,
                          isActive: true,
                        }),
                      activityForm.id ? "Atividade atualizada" : "Atividade salva",
                    )
                  }}
                >
                  <Field label="Nome da atividade">
                    <Input
                      required
                      placeholder="Ex.: Culto de domingo"
                      value={activityForm.title}
                      onChange={(event) =>
                        setActivityForm({
                          ...activityForm,
                          title: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Descrição" help="Esta informação aparecerá na Agenda do Portal do Membro.">
                    <Textarea
                      required
                      placeholder="Explique o objetivo, orientações e o que o membro precisa saber."
                      maxLength={4000}
                      value={activityForm.description}
                      onChange={(event) =>
                        setActivityForm({
                          ...activityForm,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Data e horário">
                    <Input
                      required
                      type="datetime-local"
                      value={activityForm.startsAt}
                      onChange={(event) =>
                        setActivityForm({
                          ...activityForm,
                          startsAt: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Duração (minutos)">
                      <Input
                        required
                        type="number"
                        min="1"
                        value={activityForm.durationMinutes}
                        onChange={(event) =>
                          setActivityForm({
                            ...activityForm,
                            durationMinutes: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Local">
                      <Input
                        placeholder="Ex.: Auditório"
                        value={activityForm.location}
                        onChange={(event) =>
                          setActivityForm({
                            ...activityForm,
                            location: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="Repetição" help="Use semanal para uma atividade que se repete nos dias escolhidos.">
                    <Select
                      value={activityForm.recurrenceFrequency}
                      onValueChange={(value) =>
                        setActivityForm({
                          ...activityForm,
                          recurrenceFrequency: value ?? "none",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Uma vez</SelectItem>
                        <SelectItem value="weekly">Toda semana</SelectItem>
                        <SelectItem value="monthly">Todo mês</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {activityForm.recurrenceFrequency === "weekly" && (
                    <div className="flex flex-wrap gap-2">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, day) => (
                        <Button key={label} type="button" size="sm" variant={activityForm.recurrenceWeekdays.includes(day) ? "default" : "outline"} onClick={() => setWeekday(day)}>
                          {label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={pending || !canManage}>
                      <Save className="mr-2 h-4 w-4" />
                      {activityForm.id ? "Atualizar atividade" : "Salvar atividade"}
                    </Button>
                  </div>
                </form>

</WorkspaceDialog>
            <Card>
              <CardHeader>
                <CardTitle>Agenda do ministério</CardTitle>
                <CardDescription>As ocorrências materializadas ficam disponíveis para presença e escala.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.agenda.map((activity) => (
                  <div key={activity.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 break-words">
                      <p className="font-medium">{activity.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{activity.description || "Sem descrição"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(activity.startsAt)} · {activity.location || "Sem local"}
                      </p>
                    </div>
                    <Badge variant={activity.volunteerPositions ? (activity.scaleComplete ? "default" : "destructive") : "outline"}>{activity.volunteerPositions ? `${activity.assignedVolunteers}/${activity.volunteerPositions} pessoas` : "Sem funções"}</Badge>
                    {canManage && (
                      <div className="flex gap-1">
                        {activity.programmingId && (
                          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} aria-label={`Editar atividade ${activity.title}`} onClick={() => editActivity(activity)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          aria-label={`Excluir atividade ${activity.title}`}
                          onClick={() => confirmRemoval(`a atividade ${activity.title} e as ocorrências não publicadas`, () => run(
                              () => removeMinistryActivity({ ministryId: profile.id, eventId: activity.id }),
                              "Atividade excluída",
                            ))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
                {data.agenda.length === 0 && <EmptyState icon={Activity} title="Nenhuma atividade cadastrada" description="Planeje uma atividade para começar a organizar as escalas." action={canManage ? <Button onClick={() => setDialog("activity")}>Nova atividade</Button> : undefined} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="escalas" className="space-y-4">
<SectionHeader title="Escalas" description="Distribua as funções e acompanhe a presença nas atividades." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("attendance") }}><Plus className="h-4 w-4" />Registrar presença</Button>}{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("scale") }}><Plus className="h-4 w-4" />Criar escala</Button>}</>} />
          <div className="grid grid-cols-1 gap-4">
            <WorkspaceDialog open={dialog === "scale"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Criar escala"} description="Fluxo simples: escolha a atividade, cadastre as funções, escolha pessoas e publique." pending={pending}>

                {data.agenda.length === 0 ? (
                  <div className="space-y-3 rounded-xl border border-dashed p-4">
                    <p className="font-medium">Você ainda não tem uma atividade.</p>
                    <p className="text-sm text-muted-foreground">Crie a atividade primeiro na Agenda. Depois volte aqui para montar a escala.</p>
                    <Button type="button" onClick={() => setActiveTab("agenda")}>
                      <Activity className="mr-2 h-4 w-4" />
                      Ir para Agenda
                    </Button>
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      run(async () => {
                        const saved = await saveMinistryScalePositions({
                          ministryId: profile.id,
                          eventId: scaleEventId,
                          positions: scalePositions.map((position) => ({
                            roleName: position.roleName,
                            requiredVolunteers: Number(position.requiredVolunteers),
                            instructions: position.instructions,
                          })),
                        })
                        if (!saved.ok) return saved
                        return generateMinistryScale({
                          ministryId: profile.id,
                          eventId: scaleEventId,
                        })
                      }, "Funções salvas e escala montada")
                    }}
                  >
                    <div className="flex gap-3">
                      <Badge>1</Badge>
                      <div className="flex-1">
                        <Field label="Atividade da Agenda" help="A escala será vinculada a esta ocorrência.">
                          <Select value={scaleEventId || "none"} onValueChange={(value) => setScaleEventId(value === "none" ? "" : (value ?? ""))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Escolha uma atividade" />
                            </SelectTrigger>
                            <SelectContent>
                              {data.agenda.map((activity) => (
                                <SelectItem key={activity.id} value={activity.id}>
                                  {activity.title} · {new Date(activity.startsAt).toLocaleDateString("pt-BR")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Badge>2</Badge>
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="font-medium">Funções e vagas</p>
                          <p className="text-xs text-muted-foreground">Ex.: Recepção — 2 vagas. A função é o que a pessoa fará na atividade.</p>
                        </div>
                        {scalePositions.map((position, index) => (
                          <div key={index} className="rounded-xl border p-3">
                            <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
                              <Input
                                required
                                placeholder="Função (ex.: Recepção)"
                                value={position.roleName}
                                onChange={(event) =>
                                  setScalePositions((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            roleName: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <Input
                                required
                                type="number"
                                min="1"
                                max="100"
                                aria-label="Quantidade de vagas"
                                placeholder="Vagas"
                                value={position.requiredVolunteers}
                                onChange={(event) =>
                                  setScalePositions((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            requiredVolunteers: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <Button type="button" size="icon-sm" variant="ghost" aria-label="Remover função" disabled={scalePositions.length === 1} onClick={() => setScalePositions((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <Input
                              className="mt-2"
                              placeholder="Instrução opcional (ex.: chegar 30 minutos antes)"
                              value={position.instructions}
                              onChange={(event) =>
                                setScalePositions((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          instructions: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setScalePositions((current) => [
                              ...current,
                              {
                                roleName: "",
                                requiredVolunteers: "1",
                                instructions: "",
                              },
                            ])
                          }
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          Adicionar função
                        </Button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={pending || !canManage || !scaleEventId}>
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      Salvar funções e montar escala
                    </Button>
                  </form>
                )}

</WorkspaceDialog>
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <CardTitle>Escalas do ministério</CardTitle>
                      <CardDescription>Veja quem está escalado em cada função — as vagas em aberto aparecem destacadas.</CardDescription>
                    </div>
                    <ViewToggle value={scalesView} onChange={setScalesView} showLabel ariaLabel="Modo de visualização das escalas" className="[&_[aria-pressed=true]]:bg-primary [&_[aria-pressed=true]]:text-primary-foreground" options={[{ value: "list", label: "Lista", icon: List }, { value: "grid", label: "Grade", icon: Grid2X2 }]} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {data.scales.map((scale) => {
                    const missing = scale.positions.reduce((sum, position) => sum + position.missingVolunteers, 0)
                    const assignedTotal = scale.positions.reduce((sum, position) => sum + position.assignedVolunteers, 0)
                    const requiredTotal = scale.positions.reduce((sum, position) => sum + position.requiredVolunteers, 0)
                    const fillPercent = requiredTotal ? Math.round((assignedTotal / requiredTotal) * 100) : 0
                    return (
                      <div key={scale.eventId} className="rounded-xl border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-medium">{scale.eventTitle}</p>
                            <p className="text-xs text-muted-foreground">{formatDateTime(scale.startsAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={scale.status === "published" ? "default" : scale.status === "ready" ? "outline" : scale.status === "incomplete" ? "destructive" : "secondary"}>{SCALE_STATUS_LABELS[scale.status]}</Badge>
                            {canManage && scale.status !== "published" && (
                              <Button
                                type="button"
                                size="icon-sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={pending}
                                aria-label={`Excluir escala de ${scale.eventTitle}`}
                                onClick={() => confirmRemoval(`a escala de ${scale.eventTitle}`, () => run(
                                    () => removeMinistryScale({ ministryId: profile.id, eventId: scale.eventId }),
                                    "Escala excluída",
                                  ))
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {scale.positions.length > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>{assignedTotal} de {requiredTotal} {requiredTotal === 1 ? "pessoa escalada" : "pessoas escaladas"}</span>
                              <span>{missing ? `Faltam ${missing}` : "Completa"}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={fillPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`Preenchimento da escala de ${scale.eventTitle}`}>
                              <div className={`h-full rounded-full transition-all ${fillPercent === 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${fillPercent}%` }} />
                            </div>
                          </div>
                        )}
                        {scale.positions.length ? (
                          <div className={scalesView === "grid" ? "mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" : "mt-4 space-y-3"} data-scales-view={scalesView}>
                            {scale.positions.map((position) => {
                              const candidateState = position.shiftId ? scaleCandidates[position.shiftId] : undefined
                              const activeAssignments = position.assignments.filter((assignment) => !["declined", "cancelled"].includes(assignment.status))
                              const isGrid = scalesView === "grid"
                              const removeAssignment = (personId: string) =>
                                run(
                                  () =>
                                    saveMinistryScaleAssignment({
                                      ministryId: profile.id,
                                      shiftId: position.shiftId!,
                                      personId,
                                      remove: true,
                                    }),
                                  "Pessoa removida da escala",
                                )
                              return (
                                <div key={position.id} className={isGrid ? "flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-4" : "rounded-xl bg-muted/40 p-3"}>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                                    <div className="min-w-0 flex-1 break-words">
                                      <p className="font-medium">{position.roleName}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {position.assignedVolunteers}/{position.requiredVolunteers} pessoas {position.missingVolunteers ? `· faltam ${position.missingVolunteers}` : "· preenchida"}
                                      </p>
                                      {position.instructions && <p className="mt-1 text-xs text-muted-foreground">Instrução: {position.instructions}</p>}
                                    </div>
                                    {position.shiftId && scale.status !== "published" && (
                                      <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={pending} onClick={() => loadScaleCandidates(position.shiftId!)}>
                                        {candidateState?.loading ? "Carregando..." : "Escolher pessoas"}
                                      </Button>
                                    )}
                                  </div>
                                  {(activeAssignments.length > 0 || position.missingVolunteers > 0) && (
                                    <div className={isGrid ? "flex flex-col gap-2" : "mt-1 flex flex-wrap gap-2"}>
                                      {activeAssignments.map((assignment) => {
                                        const photoUrl = assignment.photoUrl ?? memberPhotoById.get(assignment.personId) ?? null
                                        return isGrid ? (
                                          <div key={assignment.id} className="flex min-w-0 items-center gap-2.5 rounded-lg border bg-muted/30 p-2">
                                            <Avatar className="size-9 shrink-0 border border-border/60">
                                              {photoUrl && <AvatarImage src={photoUrl} alt={assignment.personName} />}
                                              <AvatarFallback>{personInitials(assignment.personName)}</AvatarFallback>
                                            </Avatar>
                                            <p className="min-w-0 flex-1 truncate text-sm">{assignment.personName}</p>
                                            <button
                                              type="button"
                                              className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                              aria-label={`Remover ${assignment.personName}`}
                                              onClick={() => removeAssignment(assignment.personId)}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div key={assignment.id} className="flex min-w-0 items-center gap-1.5 rounded-full border bg-background py-1 pr-1.5 pl-1">
                                            <Avatar size="sm" className="border border-border/60">
                                              {photoUrl && <AvatarImage src={photoUrl} alt={assignment.personName} />}
                                              <AvatarFallback>{personInitials(assignment.personName)}</AvatarFallback>
                                            </Avatar>
                                            <span className="max-w-36 truncate text-sm">{assignment.personName}</span>
                                            <button
                                              type="button"
                                              className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                              aria-label={`Remover ${assignment.personName}`}
                                              onClick={() => removeAssignment(assignment.personId)}
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        )
                                      })}
                                      {Array.from({ length: position.missingVolunteers }, (_, slotIndex) =>
                                        isGrid ? (
                                          <div key={`open-${slotIndex}`} className="flex items-center gap-2.5 rounded-lg border border-dashed p-2 text-muted-foreground">
                                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted"><Plus className="h-4 w-4" /></span>
                                            <p className="text-xs">Vaga em aberto</p>
                                          </div>
                                        ) : (
                                          <div key={`open-${slotIndex}`} className="flex items-center gap-1.5 rounded-full border border-dashed py-1 pr-3 pl-1.5 text-muted-foreground">
                                            <span className="flex size-6 items-center justify-center rounded-full bg-muted"><Plus className="h-3 w-3" /></span>
                                            <span className="text-xs">Vaga aberta</span>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                  {candidateState && !candidateState.loading && (
                                    <div className="mt-3 space-y-2 border-t pt-3">
                                      <p className="text-xs font-medium">Candidatos ativos do ministério</p>
                                      {candidateState.items.map((candidate) => {
                                        const photoUrl = memberPhotoById.get(candidate.personId) ?? null
                                        return (
                                          <div key={candidate.personId} className="flex items-center gap-2.5 rounded-lg border bg-background p-2">
                                            <Avatar className="size-8 shrink-0 border border-border/60">
                                              {photoUrl && <AvatarImage src={photoUrl} alt={candidate.personName} />}
                                              <AvatarFallback>{personInitials(candidate.personName)}</AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm">{candidate.personName}</p>
                                              {candidate.blockers.length > 0 && <p className="text-xs text-destructive">Bloqueado: {candidate.blockers.join(", ")}</p>}
                                              {candidate.warnings.length > 0 && <p className="text-xs text-amber-600">Atenção: {candidate.warnings.join(", ")}</p>}
                                            </div>
                                            <Button
                                              type="button"
                                              size="sm"
                                              disabled={pending || !candidate.selectableManually}
                                              onClick={() =>
                                                run(
                                                  () =>
                                                    saveMinistryScaleAssignment({
                                                      ministryId: profile.id,
                                                      shiftId: position.shiftId!,
                                                      personId: candidate.personId,
                                                    }),
                                                  "Pessoa adicionada à escala",
                                                )
                                              }
                                            >
                                              Escalar
                                            </Button>
                                          </div>
                                        )
                                      })}
                                      {candidateState.items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum membro ativo disponível.</p>}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">Nenhuma função cadastrada para esta atividade.</p>
                        )}
                        {scale.status !== "published" && scale.positions.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm">{missing ? "Complete as vagas para publicar a escala." : "Todas as vagas estão preenchidas."}</p>
                            <Button
                              type="button"
                              disabled={pending || !canManage || missing > 0}
                              onClick={() =>
                                run(
                                  () =>
                                    publishMinistryScale({
                                      ministryId: profile.id,
                                      eventId: scale.eventId,
                                    }),
                                  "Escala publicada",
                                )
                              }
                            >
                              Publicar escala
                            </Button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {data.scales.length === 0 && <EmptyState icon={ClipboardCheck} title="Nenhuma atividade disponível" description="Cadastre uma atividade na Agenda para montar sua escala." action={<Button variant="outline" onClick={() => setActiveTab("agenda")}>Ir para Agenda</Button>} />}
                </CardContent>
              </Card>
              <WorkspaceDialog open={dialog === "attendance"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Registrar presença"} description="Registre a participação de uma pessoa na atividade." pending={pending}>
<form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      run(
                        () =>
                          recordMinistryAttendance({
                            ministryId: profile.id,
                            eventId: attendanceForm.eventId,
                            personId: attendanceForm.personId,
                            status: attendanceForm.status,
                            occurredOn: new Date().toISOString().slice(0, 10),
                          }),
                        "Presença registrada",
                      )
                    }}
                  >
                    <Field label="Atividade"><Select
                      value={attendanceForm.eventId || "none"}
                      onValueChange={(value) =>
                        setAttendanceForm({
                          ...attendanceForm,
                          eventId: value === "none" ? "" : (value ?? ""),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Atividade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Atividade</SelectItem>
                        {data.agenda.map((activity) => (
                          <SelectItem key={activity.id} value={activity.id}>
                            {activity.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select></Field>
                    <Field label="Pessoa"><Select
                      value={attendanceForm.personId || "none"}
                      onValueChange={(value) =>
                        setAttendanceForm({
                          ...attendanceForm,
                          personId: value === "none" ? "" : (value ?? ""),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pessoa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Pessoa</SelectItem>
                        {activeMembers.map((member) => (
                          <SelectItem key={member.personId} value={member.personId}>
                            {member.personName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select></Field>
                    <Field label="Situação da presença"><Select
                      value={attendanceForm.status}
                      onValueChange={(value) =>
                        setAttendanceForm({
                          ...attendanceForm,
                          status: (value ?? "present") as typeof attendanceForm.status,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="present">Presente</SelectItem>
                        <SelectItem value="absent">Ausente sem justificativa</SelectItem>
                        <SelectItem value="justified">Ausente com justificativa</SelectItem>
                      </SelectContent>
                    </Select></Field>
                    <Button type="submit" className="w-full" disabled={pending || !canManage || !attendanceForm.eventId || !attendanceForm.personId}>
                      Salvar presença
                    </Button>
                  </form>
</WorkspaceDialog>
          <Card>
                <CardHeader>
                  <CardTitle>Histórico de presença</CardTitle>
                  <CardDescription>Registros de participação nas atividades do ministério.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.attendanceRecords.length === 0 && <EmptyState icon={ClipboardCheck} title="Nenhuma presença registrada" description="Registre a participação dos membros nas atividades." action={canManage ? <Button onClick={() => setDialog("attendance")}>Registrar presença</Button> : undefined} />}
                  {data.attendanceRecords.length > 0 && (
                    <div className="mt-6 space-y-2 border-t pt-4">
                      <p className="text-sm font-medium">Registros recentes</p>
                      {data.attendanceRecords.slice(0, 20).map((record) => (
                        <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{record.personName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {record.eventTitle} · {record.occurredOn.split("-").reverse().join("/")} · {record.status === "present" ? "Presente" : record.status === "absent" ? "Ausente" : "Justificado"}
                            </p>
                          </div>
                          {canManage && (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="shrink-0 text-destructive hover:text-destructive"
                              disabled={pending}
                              aria-label={`Excluir presença de ${record.personName}`}
                              onClick={() => confirmRemoval(`o registro de presença de ${record.personName}`, () => run(
                                  () => removeMinistryAttendance({ ministryId: profile.id, attendanceId: record.id }),
                                  "Presença excluída",
                                ))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="comunicacao" className="space-y-4">
<SectionHeader title="Comunicação" description="Prepare mensagens e acompanhe suas entregas." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("communication") }}><Plus className="h-4 w-4" />Nova comunicação</Button>}</>} />
          <WorkspaceDialog open={dialog === "communication"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Nova comunicação"} description="Escolha o canal, os destinatários e a mensagem antes de enviar para a fila." pending={pending}>
<form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  run(
                    () =>
                      createMinistryCommunication({
                        ministryId: profile.id,
                        title: communicationForm.title,
                        content: communicationForm.method === "whatsapp" ? whatsappMessage.text : communicationForm.content,
                        method: communicationForm.method,
                        whatsappMessage: communicationForm.method === "whatsapp" && whatsappMessage.type !== "text" ? whatsappMessage : undefined,
                        audience: communicationForm.audience,
                        audienceRefId: communicationForm.audience === "team" ? communicationForm.audienceRefId : undefined,
                        personIds: communicationForm.audience === "manual" ? communicationForm.personIds : [],
                      }),
                    "Comunicação enviada para a fila",
                  )
                }}
              >
                <Field label="Título">
                  <Input
                    required
                    placeholder="Ex.: Ensaio especial nesta semana"
                    value={communicationForm.title}
                    onChange={(event) =>
                      setCommunicationForm({
                        ...communicationForm,
                        title: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Canal" help="A entrega física depende do canal configurado para a pessoa.">
                  <Select
                    value={communicationForm.method}
                    onValueChange={(value) =>
                      setCommunicationForm({
                        ...communicationForm,
                        method: (value ?? "push") as typeof communicationForm.method,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="push">Push</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {communicationForm.method === "whatsapp" ? (
                  <div className="space-y-1.5">
                    <Label>Mensagem do WhatsApp</Label>
                    <p className="text-xs leading-relaxed text-muted-foreground">Monte texto com botões, lista ou carrossel; a prévia mostra como a mensagem chega no celular. Variáveis personalizam pelo nome de cada pessoa.</p>
                    <MessageEditor
                      value={whatsappMessage}
                      onChange={setWhatsappMessage}
                      allowedTypes={["text", "button", "list", "carousel"]}
                      variableOptions={["nome", "primeiro_nome"]}
                      onUploadFile={uploadCommunicationMedia}
                      loadMediaUrl={loadCommunicationMediaPreview}
                    />
                  </div>
                ) : (
                  <Field label="Mensagem">
                    <Textarea
                      required
                      className="min-h-28"
                      placeholder="Escreva a mensagem"
                      value={communicationForm.content}
                      onChange={(event) =>
                        setCommunicationForm({
                          ...communicationForm,
                          content: event.target.value,
                        })
                      }
                    />
                  </Field>
                )}
                <Field label="Quem receberá" help="Você pode escolher o ministério inteiro, uma equipe ou pessoas específicas.">
                  <Select
                    value={communicationForm.audience}
                    onValueChange={(value) =>
                      setCommunicationForm({
                        ...communicationForm,
                        audience: (value ?? "ministry") as typeof communicationForm.audience,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ministry">Todo o ministério</SelectItem>
                      <SelectItem value="team">Uma equipe</SelectItem>
                      <SelectItem value="manual">Pessoas específicas</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {communicationForm.audience === "team" && (
                  <Field label="Equipe">
                    <Select
                      value={communicationForm.audienceRefId || "none"}
                      onValueChange={(value) =>
                        setCommunicationForm({
                          ...communicationForm,
                          audienceRefId: value === "none" ? "" : (value ?? ""),
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione a equipe</SelectItem>
                        {data.teams
                          .filter((team) => team.isActive)
                          .map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {communicationForm.audience === "manual" && (
                  <div className="rounded-xl border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">Pessoas específicas</p>
                        <p className="text-xs text-muted-foreground">{communicationForm.personIds.length} selecionada(s)</p>
                      </div>
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input className="pl-9" placeholder="Buscar membro" value={communicationSearch} onChange={(event) => setCommunicationSearch(event.target.value)} />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {communicationPeople.map((member) => (
                        <label key={member.personId} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm">
                          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={communicationForm.personIds.includes(member.personId)} onChange={() => toggleCommunicationPerson(member.personId)} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{member.personName}</span>
                            <span className="block truncate text-xs text-muted-foreground">{member.email || member.phone || "Sem contato"}</span>
                          </span>
                        </label>
                      ))}
                      {communicationPeople.length === 0 && <p className="text-sm text-muted-foreground">Nenhum membro encontrado.</p>}
                    </div>
                  </div>
                )}
                <Button type="submit" disabled={pending || !canManage || (communicationForm.method === "whatsapp" && !whatsappMessage.text.trim()) || (communicationForm.audience === "team" && !communicationForm.audienceRefId) || (communicationForm.audience === "manual" && communicationForm.personIds.length === 0)}>
                  <Megaphone className="mr-2 h-4 w-4" />
                  Enviar para fila
                </Button>
              </form>
</WorkspaceDialog>
          <Card>
            <CardHeader>
              <CardTitle>Comunicações do ministério</CardTitle>
              <CardDescription>Acompanhe a situação das mensagens e consulte as entregas.</CardDescription>
            </CardHeader>
            <CardContent>

              <div className="space-y-3">
                <div>
                  <p className="font-medium">Comunicações criadas</p>
                  <p className="text-xs text-muted-foreground">Excluir remove a campanha da operação; mensagens já entregues não podem ser desfeitas.</p>
                </div>
                {data.communications.map((communication) => (
                  <div key={communication.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 break-words">
                      <p className="truncate font-medium">{communication.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {communication.method.toUpperCase()} · {communication.snapshotCount} destinatário(s) · {new Date(communication.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Badge variant={communication.status === "completed" ? "default" : communication.status === "failed" ? "destructive" : "secondary"}>
                      {COMMUNICATION_STATUS_LABELS[communication.status] ?? communication.status}
                    </Badge>
                    <Button type="button" size="sm" variant="outline" onClick={() => router.push(`/notificacao/${communication.id}`)}>
                      Ver entregas
                    </Button>
                    {canManage && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={pending}
                        aria-label={`Excluir comunicação ${communication.title}`}
                        onClick={() => confirmRemoval(`a comunicação ${communication.title}`, () => run(
                            () => removeMinistryCommunication({ ministryId: profile.id, communicationId: communication.id }),
                            "Comunicação excluída",
                          ))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {data.communications.length === 0 && <EmptyState icon={Megaphone} title="Nenhuma comunicação criada" description="Prepare uma mensagem e escolha seus destinatários." action={canManage ? <Button onClick={() => setDialog("communication")}>Nova comunicação</Button> : undefined} />}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recursos" className="space-y-4">
<SectionHeader title="Recursos" description="Compartilhe materiais com o ministério." action={<>{canManage && <Button type="button" disabled={pending} onClick={() => { setDialog("resource") }}><Plus className="h-4 w-4" />Novo recurso</Button>}</>} />
          <div className="grid grid-cols-1 gap-4">
            <WorkspaceDialog open={dialog === "resource"} onOpenChange={(open) => { if (!pending && !open) setDialog(null) }} title={"Novo recurso"} description="Compartilhe materiais com o ministério." pending={pending}>

                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const form = event.currentTarget
                    const file = (form.elements.namedItem("file") as HTMLInputElement).files?.[0]
                    if (file) {
                      const formData = new FormData(form)
                      formData.set("ministryId", profile.id)
                      runFormData(formData, "Recurso publicado")
                    } else {
                      run(
                        () =>
                          saveMinistryResource({
                            ministryId: profile.id,
                            title: resourceForm.title,
                            description: resourceForm.description,
                            category: resourceForm.category,
                            externalUrl: resourceForm.externalUrl || null,
                            visibility: resourceForm.visibility,
                            sortOrder: Number(resourceForm.sortOrder),
                          }),
                        "Recurso publicado",
                      )
                    }
                  }}
                >
                  <Field label="Título"><Input
                    required
                    placeholder="Título"
                    value={resourceForm.title}
                    onChange={(event) =>
                      setResourceForm({
                        ...resourceForm,
                        title: event.target.value,
                      })
                    }
                  /></Field>
                  <Field label="Descrição"><Textarea
                    placeholder="Descrição"
                    value={resourceForm.description}
                    onChange={(event) =>
                      setResourceForm({
                        ...resourceForm,
                        description: event.target.value,
                      })
                    }
                  /></Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Categoria"><Input
                      placeholder="Categoria"
                      value={resourceForm.category}
                      onChange={(event) =>
                        setResourceForm({
                          ...resourceForm,
                          category: event.target.value,
                        })
                      }
                    /></Field>
                    <Field label="Visibilidade"><Select
                      value={resourceForm.visibility}
                      onValueChange={(value) =>
                        setResourceForm({
                          ...resourceForm,
                          visibility: (value ?? "members") as typeof resourceForm.visibility,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leaders">Líderes</SelectItem>
                        <SelectItem value="members">Membros</SelectItem>
                        <SelectItem value="public">Público</SelectItem>
                      </SelectContent>
                    </Select></Field>
                  </div>
                  <Field label="Link externo"><Input
                    placeholder="URL externa (ou envie um arquivo)"
                    type="url"
                    value={resourceForm.externalUrl}
                    onChange={(event) =>
                      setResourceForm({
                        ...resourceForm,
                        externalUrl: event.target.value,
                      })
                    }
                  /></Field>
                  <Field label="Arquivo"><Input name="file" type="file" accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" /></Field>
                  <Button type="submit" className="w-full" disabled={pending || !canManage}>
                    <FileText className="mr-2 h-4 w-4" />
                    Publicar recurso
                  </Button>
                </form>

</WorkspaceDialog>
            <Card>
              <CardHeader>
                <CardTitle>Biblioteca do ministério</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.resources.map((resource) => (
                  <div key={resource.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <div className="min-w-0 flex-1 break-words">
                      <p className="font-medium">{resource.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {resource.category} · {resource.visibility}
                      </p>
                    </div>
                    {(resource.fileUrl || resource.externalUrl) && (
                      <Button render={<a href={resource.fileUrl || resource.externalUrl || ""} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
                        <Download className="mr-1 h-4 w-4" />
                        Abrir
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => confirmRemoval(`o recurso ${resource.title}`, () => run(
                            () =>
                              removeMinistryResource({
                                ministryId: profile.id,
                                resourceId: resource.id,
                              }),
                            "Recurso removido",
                          ))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {data.resources.length === 0 && <EmptyState icon={FileText} title="Nenhum recurso publicado" description="Compartilhe arquivos e links úteis para o ministério." action={canManage ? <Button onClick={() => setDialog("resource")}>Novo recurso</Button> : undefined} />}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="space-y-4">
<SectionHeader title="Relatórios" description="Consulte os indicadores e a participação por equipe." />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Stat label="Horas voluntárias" value={Math.round(data.report.volunteerHours)} tone="blue-600" />
            <Stat label="Escalas publicadas" value={data.report.filledScales} tone="green-600" />
            <Stat label="Retenção 30d" value={data.report.retention.rate} tone="violet-600" />
            <Stat label="Acompanhamentos concluídos" value={data.report.completedFollowUps} tone="green-600" />
            <Stat label="Comunicações" value={data.report.communication.reduce((total, item) => total + item.total, 0)} tone="violet-600" />
          </div>
          <Card className="mt-4">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Participação por equipe</CardTitle>
                <div className="flex gap-2">
                  <Button render={<a href={`/api/ministerios/${profile.id}/export?format=xls`} download />} nativeButton={false} size="sm" variant="outline">
                    <Download className="mr-1 h-4 w-4" />
                    Excel
                  </Button>
                  <Button render={<a href={`/api/ministerios/${profile.id}/export?format=csv`} download />} nativeButton={false} size="sm" variant="outline">
                    <Download className="mr-1 h-4 w-4" />
                    CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.report.teamParticipation.map((team) => (
                <div key={team.teamId} className="flex justify-between rounded-xl border p-3">
                  <span>{team.teamName}</span>
                  <strong>{team.total}</strong>
                </div>
              ))}
              {data.report.teamParticipation.length === 0 && <p className="text-sm text-muted-foreground">Sem participação registrada.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracoes" className="space-y-4">
<SectionHeader title="Configurações" description="Atualize as informações e as preferências do ministério." />
          <Card>
            <CardHeader>
              <CardTitle>Configurações do ministério</CardTitle>
              <CardDescription>Preencha cada seção para que outras pessoas entendam como o ministério funciona. Os exemplos abaixo são apenas orientações.</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-6"
                onSubmit={(event) => {
                  event.preventDefault()
                  startTransition(async () => {
                    try {
                      const result = await saveMinistryProfile({
                        ministryId: profile.id,
                        name: profileForm.name,
                        slug: profileForm.slug || undefined,
                        ministryType: profileForm.ministryType,
                        mission: profileForm.mission,
                        description: profileForm.description,
                        targetAudience: profileForm.targetAudience,
                        contact: profileForm.contact,
                        leaderPersonId: profileForm.leaderPersonId || null,
                        meetingDay: profileForm.meetingDay === "" ? null : Number(profileForm.meetingDay),
                        meetingTime: profileForm.meetingTime || null,
                        meetingLocation: profileForm.meetingLocation,
                        publicJoinEnabled: profileForm.publicJoinEnabled,
                        isActive: profileForm.isActive,
                      })
                      if (!result.ok) {
                        toast.error(result.error ?? "Não foi possível salvar as configurações")
                      } else {
                        toast.success("Configurações salvas")
                        const newSlug = (result.data as { slug?: string } | undefined)?.slug
                        if (newSlug && newSlug !== profile.slug) {
                          router.replace(`${memberPortal ? "/membro/ministerios" : "/ministerios"}/${newSlug}`)
                        } else {
                          router.refresh()
                        }
                      }
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as configurações")
                    }
                  })
                }}
              >
                <section className="space-y-3">
                  <div>
                    <h3 className="font-semibold">Identidade</h3>
                    <p className="text-sm text-muted-foreground">Como o ministério aparece para a igreja.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Nome do ministério" help="Ex.: Ministério de Homens.">
                      <Input
                        required
                        value={profileForm.name}
                        onChange={(event) =>
                          setProfileForm({
                            ...profileForm,
                            name: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Link amigável (slug)" help="Ex.: /ministerios/homens">
                      <div className="flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                        <span>/ministerios/</span>
                        <Input
                          value={profileForm.slug}
                          onChange={(event) =>
                            setProfileForm({
                              ...profileForm,
                              slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                            })
                          }
                          placeholder="ex: homens"
                          className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                        />
                      </div>
                    </Field>
                    <Field label="Tipo" help="Ajuda a organizar relatórios e filtros.">
                      <Select
                        value={profileForm.ministryType}
                        onValueChange={(value) =>
                          setProfileForm({
                            ...profileForm,
                            ministryType: (value ?? "other") as typeof profileForm.ministryType,
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            ["worship", "Louvor"],
                            ["kids", "Kids"],
                            ["youth", "Jovens"],
                            ["care", "Cuidado"],
                            ["discipleship", "Discipulado"],
                            ["outreach", "Evangelismo"],
                            ["administration", "Administração"],
                            ["other", "Outro"],
                          ].map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </section>
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-semibold">Propósito</h3>
                    <p className="text-sm text-muted-foreground">Explique por que o ministério existe e quem ele serve.</p>
                  </div>
                  <Field label="Missão" help="Ex.: Cuidar, discipular e formar homens para servir a igreja e suas famílias.">
                    <Textarea
                      className="min-h-24"
                      value={profileForm.mission}
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          mission: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Descrição" help="Detalhe atividades, cultura ou forma de participação.">
                      <Textarea
                        value={profileForm.description}
                        onChange={(event) =>
                          setProfileForm({
                            ...profileForm,
                            description: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Público" help="Ex.: Homens adultos e jovens a partir de 18 anos.">
                      <Input
                        value={profileForm.targetAudience}
                        onChange={(event) =>
                          setProfileForm({
                            ...profileForm,
                            targetAudience: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </section>
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-semibold">Contato</h3>
                    <p className="text-sm text-muted-foreground">Informe como alguém pode tirar dúvidas.</p>
                  </div>
                  <Field label="Contato principal" help="Ex.: WhatsApp (11) 99999-0000 ou contato@igreja.com.">
                    <Input
                      value={profileForm.contact}
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          contact: event.target.value,
                        })
                      }
                    />
                  </Field>
                </section>
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-semibold">Reuniões</h3>
                    <p className="text-sm text-muted-foreground">Esses campos são usados para orientar membros e líderes.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Dia da semana" help="Escolha o dia padrão do encontro.">
                      <Select
                        value={profileForm.meetingDay || "none"}
                        onValueChange={(value) =>
                          setProfileForm({
                            ...profileForm,
                            meetingDay: value === "none" ? "" : (value ?? ""),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Não definido" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Não definido</SelectItem>
                          {DAY_NAMES.map((day, index) => (
                            <SelectItem key={day} value={String(index)}>
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Horário" help="Ex.: 19:30.">
                      <Input
                        type="time"
                        value={profileForm.meetingTime}
                        onChange={(event) =>
                          setProfileForm({
                            ...profileForm,
                            meetingTime: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Local" help="Ex.: Sala multiuso ou endereço completo.">
                      <Input
                        value={profileForm.meetingLocation}
                        onChange={(event) =>
                          setProfileForm({
                            ...profileForm,
                            meetingLocation: event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>
                </section>
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-semibold">Entrada de membros</h3>
                    <p className="text-sm text-muted-foreground">Defina se pessoas poderão solicitar entrada pelo portal. A aprovação continua sendo manual.</p>
                  </div>
                  <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={profileForm.publicJoinEnabled}
                      onChange={(event) =>
                        setProfileForm({
                          ...profileForm,
                          publicJoinEnabled: event.target.checked,
                        })
                      }
                    />
                    <span>
                      <span className="block font-medium">Aceitar solicitações de entrada</span>
                      <span className="text-xs text-muted-foreground">Quando desativado, somente gestores poderão adicionar pessoas manualmente.</span>
                    </span>
                  </label>
                </section>
                <section className="space-y-3 border-t pt-5">
                  <div>
                    <h3 className="font-semibold">Responsável</h3>
                    <p className="text-sm text-muted-foreground">O responsável principal cuida da gestão geral do ministério.</p>
                  </div>
                  {isAdmin ? (
                    <>
                      <Field label="Responsável principal" help="Somente administradores, pastores e superadmins podem alterar este campo.">
                        <Select
                          value={profileForm.leaderPersonId || "none"}
                          onValueChange={(value) =>
                            setProfileForm({
                              ...profileForm,
                              leaderPersonId: value === "none" ? "" : (value ?? ""),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sem responsável" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem responsável</SelectItem>
                            {data.leaderCandidates.map((person) => (
                              <SelectItem key={person.id} value={person.id}>
                                {person.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={profileForm.isActive}
                          onChange={(event) =>
                            setProfileForm({
                              ...profileForm,
                              isActive: event.target.checked,
                            })
                          }
                        />
                        Ministério ativo
                      </label>
                    </>
                  ) : (
                    <div className="rounded-xl border bg-muted/40 p-3 text-sm">Responsável principal e status são administrados pela equipe da igreja. Você pode alterar as demais configurações autorizadas.</div>
                  )}
                </section>
                <Button type="submit" className="w-full" disabled={pending || !canManage}>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar configurações
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir {confirmDelete?.label}? Esta ação não poderá ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { confirmDelete?.run(); setConfirmDelete(null) }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
