"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Baby,
  CalendarDays,
  Cake,
  CheckCircle2,
  Circle,
  Church,
  ClipboardList,
  Clock,
  Edit3,
  FileText,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Route,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import {
  assignPersonActivity,
  enrollPersonInJourney,
  invitePersonAccess,
  removePersonActivity,
  togglePersonActivityAssignment,
  toggleStepProgress,
  unenrollPersonFromJourney,
} from "../actions"
import { FollowUpPanel } from "./follow-up-panel"
import type { PersonAccessRole, PersonDetail, PersonStatus, PersonType } from "@/lib/people/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface MemberDetailClientProps {
  person: PersonDetail
  cells: { id: string; name: string }[]
  responsibleOptions: { id: string; name: string }[]
}

const statusColors: Record<PersonStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
  visitor: "bg-info/10 text-info border-info/20",
}

const statusLabels: Record<PersonStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  visitor: "Visitante",
}

const personTypeLabels: Record<PersonType, string> = {
  attendee: "Frequentador",
  leader: "Líder",
  member: "Membro",
  visitor: "Visitante",
  volunteer: "Voluntário",
}

const genderLabels = {
  female: "Feminino",
  male: "Masculino",
  not_informed: "Não informado",
  other: "Outro",
}

const accessRoleLabels: Record<PersonAccessRole, string> = {
  admin: "Admin",
  pastor: "Pastor",
  ministry_leader: "Líder de ministério",
  cell_supervisor: "Supervisor de células",
  cell_leader: "Líder de célula",
  communication: "Comunicação",
  finance: "Financeiro",
  volunteer: "Voluntário",
  member: "Membro",
}

const activityCategoryLabels: Record<string, string> = {
  ministry: "Ministério",
  pastoral: "Pastoral",
  small_group: "Célula",
  volunteer: "Voluntariado",
  worship: "Louvor",
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatDate(value: string | null) {
  if (!value) return "-"
  try {
    return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
  } catch {
    return "-"
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "-"
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return "-"
  }
}

function infoValue(value: string | null | undefined) {
  return value?.trim() || "-"
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/40 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}

export function MemberDetailClient({ person, cells, responsibleOptions }: MemberDetailClientProps) {
  const router = useRouter()
  const { hasRole } = useAuth()
  const canInviteAccess = hasRole(["superadmin", "admin", "pastor"])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [accessRole, setAccessRole] = useState<PersonAccessRole>(person.accessRole ?? "member")
  const [cellIds, setCellIds] = useState<string[]>(person.cellIds)
  const [temporaryPassword, setTemporaryPassword] = useState("")

  // Activity assignment state
  const [assignActivityOpen, setAssignActivityOpen] = useState(false)
  const [selectedActivityId, setSelectedActivityId] = useState("")
  const [isAssigningActivity, setIsAssigningActivity] = useState(false)

  // Journey enrollment state
  const [enrollJourneyOpen, setEnrollJourneyOpen] = useState(false)
  const [selectedJourneyId, setSelectedJourneyId] = useState("")
  const [isEnrollingJourney, setIsEnrollingJourney] = useState(false)

  // Step toggle & note modal state
  const [stepModalOpen, setStepModalOpen] = useState(false)
  const [stepModalData, setStepModalData] = useState<{
    journeyId: string
    journeyName: string
    stepId: string
    stepName: string
    completed: boolean
    completedAt: string
    notes: string
  } | null>(null)
  const [isSavingStep, setIsSavingStep] = useState(false)

  const handleInvite = async () => {
    if (!person.email?.trim()) {
      toast.error("Informe um e-mail na pessoa antes de convidar o acesso")
      return
    }
    if (temporaryPassword.length < 8) {
      toast.error("Senha temporária deve ter no mínimo 8 caracteres")
      return
    }
    if (accessRole === "cell_leader" && cellIds.length === 0) {
      toast.error("Selecione ao menos uma célula para o líder")
      return
    }

    setIsInviting(true)
    const result = await invitePersonAccess({
      personId: person.id,
      companyId: person.companyId,
      role: accessRole,
      temporaryPassword,
      cellIds: accessRole === "cell_leader" ? cellIds : [],
    })
    setIsInviting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível convidar o acesso")
      return
    }

    toast.success(
      person.hasSystemAccess
        ? "Acesso atualizado. Informe a senha temporária à pessoa."
        : "Acesso criado. Informe a senha temporária à pessoa.",
    )
    setInviteOpen(false)
    setTemporaryPassword("")
    router.refresh()
  }

  const handleAssignActivity = async () => {
    if (!selectedActivityId) {
      toast.error("Selecione uma atividade para vincular")
      return
    }
    setIsAssigningActivity(true)
    try {
      const res = await assignPersonActivity({
        personId: person.id,
        activityId: selectedActivityId,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao vincular atividade")
        return
      }
      toast.success("Atividade vinculada com sucesso!")
      setAssignActivityOpen(false)
      setSelectedActivityId("")
      router.refresh()
    } catch {
      toast.error("Erro ao vincular atividade")
    } finally {
      setIsAssigningActivity(false)
    }
  }

  const handleToggleActivity = async (assignmentId: string, currentActive: boolean) => {
    try {
      const res = await togglePersonActivityAssignment(assignmentId, !currentActive)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao alterar status da atividade")
        return
      }
      toast.success(!currentActive ? "Atividade reativada!" : "Atividade pausada!")
      router.refresh()
    } catch {
      toast.error("Erro ao alterar status da atividade")
    }
  }

  const handleRemoveActivity = async (assignmentId: string) => {
    try {
      const res = await removePersonActivity(assignmentId)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao desvincular atividade")
        return
      }
      toast.success("Atividade desvinculada com sucesso!")
      router.refresh()
    } catch {
      toast.error("Erro ao desvincular atividade")
    }
  }

  const handleEnrollJourney = async () => {
    if (!selectedJourneyId) {
      toast.error("Selecione uma trilha de integração")
      return
    }
    setIsEnrollingJourney(true)
    try {
      const res = await enrollPersonInJourney({
        personId: person.id,
        journeyId: selectedJourneyId,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao iniciar trilha")
        return
      }
      toast.success("Pessoa inscrita na trilha com sucesso!")
      setEnrollJourneyOpen(false)
      setSelectedJourneyId("")
      router.refresh()
    } catch {
      toast.error("Erro ao inscrever na trilha")
    } finally {
      setIsEnrollingJourney(false)
    }
  }

  const handleUnenrollJourney = async (enrollmentId: string) => {
    try {
      const res = await unenrollPersonFromJourney(enrollmentId)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao encerrar trilha")
        return
      }
      toast.success("Inscrição na trilha encerrada com sucesso.")
      router.refresh()
    } catch {
      toast.error("Erro ao encerrar trilha")
    }
  }

  const handleOpenStepModal = (
    journeyId: string,
    journeyName: string,
    step: {
      stepId: string
      stepName: string
      completedAt: string | null
      notes: string
    },
  ) => {
    const isDone = Boolean(step.completedAt)
    setStepModalData({
      journeyId,
      journeyName,
      stepId: step.stepId,
      stepName: step.stepName,
      completed: !isDone,
      completedAt: step.completedAt ? step.completedAt.split("T")[0] : format(new Date(), "yyyy-MM-dd"),
      notes: step.notes || "",
    })
    setStepModalOpen(true)
  }

  const handleSaveStepProgress = async () => {
    if (!stepModalData) return
    setIsSavingStep(true)
    try {
      const res = await toggleStepProgress({
        personId: person.id,
        journeyId: stepModalData.journeyId,
        stepId: stepModalData.stepId,
        completed: stepModalData.completed,
        notes: stepModalData.notes.trim() || undefined,
        completedAt: stepModalData.completed ? stepModalData.completedAt : null,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao atualizar etapa")
        return
      }
      toast.success(
        stepModalData.completed ? "Etapa concluída com sucesso!" : "Etapa reaberta.",
      )
      setStepModalOpen(false)
      setStepModalData(null)
      router.refresh()
    } catch {
      toast.error("Erro ao atualizar etapa")
    } finally {
      setIsSavingStep(false)
    }
  }

  const assignableActivities = (person.availableActivities ?? []).filter(
    (act) => !person.activities.some((pa) => pa.activityId === act.id),
  )

  const enrollableJourneys = (person.availableJourneys ?? []).filter(
    (j) => !person.enrolledJourneys?.some((ej) => ej.journeyId === j.id),
  )

  const legacyJourneySteps = person.journeySteps ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <Button render={<Link href="/pessoas" />} nativeButton={false} variant="outline" className="w-fit">
            <ArrowLeft className="h-4 w-4" />
            Pessoas
          </Button>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="gradient-primary text-lg text-white">
                {initials(person.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold tracking-tight md:text-3xl">
                  {person.fullName}
                </h1>
                <Badge className={statusColors[person.status]}>{statusLabels[person.status]}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="outline">{personTypeLabels[person.personType]}</Badge>
                <Badge variant="outline">{person.congregationName ?? "Sem congregação"}</Badge>
                {person.kidsRoles.map((role) => (
                  <Badge key={role} variant="outline" className="border-info/30 text-info">
                    <Baby className="mr-1 h-3 w-3" />{role === "child" ? "Criança Kids" : "Responsável Kids"}
                  </Badge>
                ))}
                {person.baptized && <Badge className="bg-primary/10 text-primary">Batizado</Badge>}
                <Badge
                  variant="outline"
                  className={
                    person.hasSystemAccess
                      ? "border-success/30 text-success"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }
                >
                  {person.hasSystemAccess ? "Com acesso" : "Sem acesso"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Tabs defaultValue="perfil">
            <TabsList>
              <TabsTrigger value="perfil">
                <UserRound />
                Perfil
              </TabsTrigger>
              <TabsTrigger value="historico">
                <Activity />
                Histórico pastoral
              </TabsTrigger>
              <TabsTrigger value="jornada">
                <Route />
                Jornada
              </TabsTrigger>
              <TabsTrigger value="linha-do-tempo">
                <Activity />
                Linha do tempo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" className="mt-4 space-y-4">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Dados principais
                  </CardTitle>
                  <CardDescription>Informações cadastrais vinculadas ao tenant.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailItem icon={Mail} label="E-mail" value={infoValue(person.email)} />
                    <DetailItem icon={Phone} label="Telefone" value={infoValue(person.phone)} />
                    <DetailItem icon={Cake} label="Nascimento" value={formatDate(person.birthDate)} />
                    <DetailItem icon={UserRound} label="Gênero" value={genderLabels[person.gender ?? "not_informed"]} />
                    <DetailItem icon={Church} label="Congregação" value={person.congregationName ?? "Sem congregação"} />
                    <DetailItem icon={MapPin} label="Endereço" value={[
                      person.postalCode && `CEP ${person.postalCode}`,
                      [person.address, person.addressNumber].filter(Boolean).join(", "),
                      person.addressComplement, person.neighborhood,
                      [person.city, person.state].filter(Boolean).join("/")
                    ].filter(Boolean).join(" · ") || "-"} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Campos personalizados
                  </CardTitle>
                  <CardDescription>{person.customFields.length} campo(s) configurado(s).</CardDescription>
                </CardHeader>
                <CardContent>
                  {person.customFields.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {person.customFields.map((field) => (
                        <div key={field.fieldId} className="rounded-lg border border-border/40 p-3">
                          <p className="text-xs text-muted-foreground">{field.name}</p>
                          {field.sourceModule === "kids" && (
                            <Badge variant="outline" className="mt-1 border-info/30 text-info">Kids · {field.kidsTargets.map((target) => target === "child" ? "Criança" : "Responsável").join("/")}</Badge>
                          )}
                          <p className="mt-1 break-words text-sm font-medium">{field.value || "Sem valor"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum campo personalizado ativo.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <Card className="glass">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Histórico Pastoral & Vínculos
                    </CardTitle>
                    <CardDescription>Atividades e áreas de atuação atribuídas a esta pessoa.</CardDescription>
                  </div>
                  {assignableActivities.length > 0 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelectedActivityId("")
                        setAssignActivityOpen(true)
                      }}
                      className="gradient-primary shrink-0"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> Vincular atividade
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {person.activities.length > 0 ? (
                    <div className="space-y-3">
                      {person.activities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/40 p-3.5 bg-muted/20 hover:border-primary/30 transition-colors"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{activity.description}</p>
                                <Badge variant="outline" className="text-xs">
                                  {activityCategoryLabels[activity.category] ?? activity.category}
                                </Badge>
                                {!activity.isActive ? (
                                  <Badge variant="destructive" className="text-xs">Pausada</Badge>
                                ) : (
                                  <Badge variant="outline" className="border-success/30 text-success text-xs">Ativa</Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Atribuída em {formatDateTime(activity.assignedAt)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleToggleActivity(activity.id, activity.isActive)}
                              title={activity.isActive ? "Pausar atuação nesta atividade" : "Reativar atuação nesta atividade"}
                            >
                              <Power className="mr-1.5 h-3.5 w-3.5" />
                              {activity.isActive ? "Pausar" : "Reativar"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveActivity(activity.id)}
                              title="Desvincular pessoa desta atividade"
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Desvincular
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Nenhuma atividade ou ministério atribuído ainda a este membro.
                      </p>
                      {assignableActivities.length > 0 ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedActivityId("")
                            setAssignActivityOpen(true)
                          }}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Vincular primeira atividade
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          render={<Link href="/pessoas" />}
                          nativeButton={false}
                          variant="outline"
                        >
                          Gerenciar atividades em Parâmetros
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="jornada" className="mt-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Trilhas de Integração & Crescimento</h2>
                  <p className="text-sm text-muted-foreground">
                    Acompanhe e registre os passos espirituais, discipulado e formação ministerial desta pessoa.
                  </p>
                </div>
                {enrollableJourneys.length > 0 && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedJourneyId("")
                      setEnrollJourneyOpen(true)
                    }}
                    className="gradient-primary shrink-0"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Iniciar nova trilha
                  </Button>
                )}
              </div>

              {person.enrolledJourneys.length === 0 ? (
                <Card className="glass">
                  <CardContent className="py-10 text-center space-y-3">
                    <Route className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <p className="text-sm text-muted-foreground">
                      Esta pessoa ainda não foi inscrita em nenhuma trilha de integração.
                    </p>
                    {enrollableJourneys.length > 0 ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedJourneyId("")
                          setEnrollJourneyOpen(true)
                        }}
                        className="gradient-primary"
                      >
                        <Plus className="mr-1.5 h-4 w-4" /> Iniciar primeira trilha
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        render={<Link href="/pessoas" />}
                        nativeButton={false}
                        variant="outline"
                      >
                        Configurar trilhas em Parâmetros
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {person.enrolledJourneys.map((journey) => {
                    const completedStepsCount = journey.steps.filter((s) => s.completedAt).length
                    const totalStepsCount = journey.steps.length
                    const progress = totalStepsCount > 0 ? Math.round((completedStepsCount / totalStepsCount) * 100) : 0

                    return (
                      <Card key={journey.enrollmentId} className="glass">
                        <CardHeader className="pb-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Route className="h-4 w-4 text-primary" />
                                  {journey.journeyName}
                                </CardTitle>
                                {journey.status === "completed" ? (
                                  <Badge className="bg-success/15 text-success border-success/30 text-xs">
                                    Concluída
                                  </Badge>
                                ) : journey.status === "dropped" ? (
                                  <Badge variant="outline" className="text-muted-foreground text-xs">
                                    Pausada
                                  </Badge>
                                ) : (
                                  <Badge className="bg-info/15 text-info border-info/30 text-xs">
                                    Em andamento
                                  </Badge>
                                )}
                              </div>
                              {journey.description ? (
                                <CardDescription className="text-xs">{journey.description}</CardDescription>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-semibold text-muted-foreground">
                                {completedStepsCount} de {totalStepsCount} etapas ({progress}%)
                              </span>
                              {!journey.enrollmentId.startsWith("legacy-") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                                  onClick={() => handleUnenrollJourney(journey.enrollmentId)}
                                  title="Encerrar inscrição nesta trilha"
                                >
                                  Encerrar trilha
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/60">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </CardHeader>

                        <CardContent>
                          <div className="space-y-2.5">
                            {journey.steps.map((step) => {
                              const done = Boolean(step.completedAt)
                              return (
                                <div
                                  key={step.stepId}
                                  className="flex items-start justify-between gap-3 rounded-lg border border-border/40 p-3 bg-muted/10 hover:border-primary/30 transition-colors"
                                >
                                  <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenStepModal(journey.journeyId, journey.journeyName, step)}
                                      className="mt-0.5 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                                      title={done ? "Clique para gerenciar conclusão" : "Clique para concluir esta etapa"}
                                    >
                                      {done ? (
                                        <CheckCircle2 className="h-5 w-5 text-success hover:scale-110 transition-transform" />
                                      ) : (
                                        <Circle className="h-5 w-5 text-muted-foreground hover:scale-110 hover:text-primary transition-all" />
                                      )}
                                    </button>

                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p
                                          className={`text-sm font-medium ${
                                            done ? "line-through text-muted-foreground" : "text-foreground"
                                          }`}
                                        >
                                          {step.stepName}
                                        </p>
                                        {step.estimatedDays ? (
                                          <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground py-0">
                                            <Clock className="h-2.5 w-2.5" /> SLA: ~{step.estimatedDays}d
                                          </Badge>
                                        ) : null}
                                        {done ? (
                                          <Badge variant="outline" className="border-success/30 text-success text-[10px] py-0">
                                            Concluída em {formatDate(step.completedAt)}
                                          </Badge>
                                        ) : null}
                                      </div>

                                      {step.description ? (
                                        <p className="text-xs text-muted-foreground">{step.description}</p>
                                      ) : null}

                                      {step.notes ? (
                                        <div className="mt-1.5 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground border border-border/20">
                                          <strong className="text-foreground">Anotação pastoral:</strong> {step.notes}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>

                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleOpenStepModal(journey.journeyId, journey.journeyName, step)}
                                  >
                                    <Edit3 className="mr-1 h-3.5 w-3.5" />
                                    {done ? "Editar conclusão" : "Concluir etapa"}
                                  </Button>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="linha-do-tempo" className="mt-4">
              <FollowUpPanel
                personId={person.id}
                companyId={person.companyId}
                timeline={person.timeline}
                tasks={person.followUpTasks}
                responsibleOptions={responsibleOptions}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                Acesso ao sistema
              </CardTitle>
              <CardDescription>
                Login com e-mail e senha. Apenas admin/pastor convidam.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  variant="outline"
                  className={
                    person.hasSystemAccess
                      ? "border-success/30 text-success"
                      : "border-muted-foreground/30"
                  }
                >
                  {person.hasSystemAccess ? "Com acesso" : "Sem acesso"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">E-mail de login</span>
                <span className="font-medium">{infoValue(person.email)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Perfil</span>
                <span className="font-medium">
                  {person.accessRole ? accessRoleLabels[person.accessRole] : "-"}
                </span>
              </div>
              {person.hasSystemAccess ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Conta ativa</span>
                  <Badge variant={person.accessActive ? "default" : "destructive"}>
                    {person.accessActive ? "Sim" : "Não"}
                  </Badge>
                </div>
              ) : null}
              {canInviteAccess ? (
                <Button
                  className="mt-2 w-full"
                  variant={person.hasSystemAccess ? "outline" : "default"}
                  onClick={() => {
                    setAccessRole(person.accessRole ?? "member")
                    setCellIds(person.cellIds)
                    setTemporaryPassword("")
                    setInviteOpen(true)
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  {person.hasSystemAccess ? "Redefinir senha / perfil" : "Convidar acesso"}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Cuidado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Pessoa ativa</span>
                <Badge variant={person.isActive ? "default" : "destructive"}>
                  {person.isActive ? "Sim" : "Não"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">E-mail validado</span>
                <Badge variant={person.emailValidated ? "default" : "outline"}>
                  {person.emailValidated ? "Sim" : "Não"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Batismo</span>
                <Badge variant={person.baptized ? "default" : "outline"}>
                  {person.baptized ? "Sim" : "Não"}
                </Badge>
              </div>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Observações internas</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{person.internalNotes || "Sem observações"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                Registro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Criado em</span>
                <span className="font-medium">{formatDateTime(person.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Atualizado em</span>
                <span className="font-medium">{formatDateTime(person.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Documento</span>
                <span className="font-medium">{infoValue(person.document)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Perfil de acesso</span>
                <span className="font-medium">
                  {person.accessRole
                    ? accessRoleLabels[person.accessRole]
                    : infoValue(person.accessProfile)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {person.hasSystemAccess ? "Atualizar acesso" : "Convidar acesso"}
            </DialogTitle>
            <DialogDescription>
              A pessoa entrará em /login com o e-mail cadastrado e a senha temporária informada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>E-mail</Label>
              <Input value={person.email ?? ""} disabled placeholder="Sem e-mail" />
            </div>
            <div className="grid gap-2">
              <Label>Perfil de acesso</Label>
              <Select
                value={accessRole}
                onValueChange={(value) => value && setAccessRole(value as PersonAccessRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(accessRoleLabels) as PersonAccessRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {accessRoleLabels[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Senha temporária</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            {accessRole === "cell_leader" ? (
              <div className="space-y-2 rounded-lg border border-primary/20 bg-background/60 p-3">
                <Label>Células do líder *</Label>
                <p className="text-xs text-muted-foreground">Selecione uma ou mais células que esta pessoa poderá gerenciar.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {cells.map((cell) => (
                    <label key={cell.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                      <input
                        type="checkbox"
                        checked={cellIds.includes(cell.id)}
                        onChange={(event) => setCellIds((current) => event.target.checked
                          ? [...new Set([...current, cell.id])]
                          : current.filter((id) => id !== cell.id))}
                      />
                      {cell.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={isInviting} className="gradient-primary">
              {isInviting ? "Salvando..." : person.hasSystemAccess ? "Atualizar acesso" : "Convidar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Activity Dialog */}
      <Dialog open={assignActivityOpen} onOpenChange={setAssignActivityOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Atividade Pastoral</DialogTitle>
            <DialogDescription>
              Selecione o ministério ou área de atuação pastoral para atribuir a {person.fullName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <Label>Atividade Pastoral / Ministério *</Label>
              <Select
                value={selectedActivityId}
                onValueChange={(val) => val && setSelectedActivityId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma atividade..." />
                </SelectTrigger>
                <SelectContent>
                  {assignableActivities.map((act) => (
                    <SelectItem key={act.id} value={act.id}>
                      {act.description} ({activityCategoryLabels[act.category] ?? act.category})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignActivityOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAssignActivity}
              disabled={isAssigningActivity || !selectedActivityId}
              className="gradient-primary"
            >
              {isAssigningActivity ? "Vinculando..." : "Vincular atividade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Journey Dialog */}
      <Dialog open={enrollJourneyOpen} onOpenChange={setEnrollJourneyOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar Trilha de Integração</DialogTitle>
            <DialogDescription>
              Inscrever {person.fullName} em uma trilha de crescimento espiritual ou discipulado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <Label>Trilha de Integração *</Label>
              <Select
                value={selectedJourneyId}
                onValueChange={(val) => val && setSelectedJourneyId(val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma trilha..." />
                </SelectTrigger>
                <SelectContent>
                  {enrollableJourneys.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.name} {j.description ? `— ${j.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollJourneyOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleEnrollJourney}
              disabled={isEnrollingJourney || !selectedJourneyId}
              className="gradient-primary"
            >
              {isEnrollingJourney ? "Inscrevendo..." : "Iniciar Trilha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step Completion & Notes Modal */}
      <Dialog open={stepModalOpen} onOpenChange={setStepModalOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{stepModalData?.stepName}</DialogTitle>
            <DialogDescription>
              Trilha: {stepModalData?.journeyName} · {person.fullName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 p-3 bg-muted/20">
              <div>
                <Label>Status da etapa</Label>
                <p className="text-xs text-muted-foreground">
                  {stepModalData?.completed
                    ? "Etapa será marcada como CONCLUÍDA"
                    : "Etapa será mantida como PENDENTE"}
                </p>
              </div>
              <Switch
                checked={stepModalData?.completed ?? false}
                onCheckedChange={(checked) =>
                  setStepModalData((prev) => (prev ? { ...prev, completed: checked } : null))
                }
              />
            </div>

            {stepModalData?.completed ? (
              <div className="grid gap-2">
                <Label>Data de Conclusão</Label>
                <Input
                  type="date"
                  value={stepModalData.completedAt}
                  onChange={(e) =>
                    setStepModalData((prev) => (prev ? { ...prev, completedAt: e.target.value } : null))
                  }
                />
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label>Anotações Pastorais / Observações</Label>
              <Textarea
                placeholder="Ex.: Conversa realizada, participou do culto, batizado na congregação sede..."
                rows={3}
                value={stepModalData?.notes ?? ""}
                onChange={(e) =>
                  setStepModalData((prev) => (prev ? { ...prev, notes: e.target.value } : null))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStepModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveStepProgress}
              disabled={isSavingStep}
              className="gradient-primary"
            >
              {isSavingStep ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                "Salvar etapa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
