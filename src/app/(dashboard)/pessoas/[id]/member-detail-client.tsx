"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Baby,
  CalendarDays,
  Cake,
  CheckCircle2,

  Church,
  ClipboardList,

  Edit3,
  ExternalLink,
  FileCheck2,
  FileText,
  HeartPulse,
  KeyRound,

  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Route,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  UsersRound,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { formatBrazilianWhatsapp } from "@/lib/auth/phone"
import { cn } from "@/lib/utils"
import {
  assignPersonActivity,

  invitePersonAccess,
  removePersonActivity,
  togglePersonActivityAssignment,


  savePersonPhoto,
} from "../actions"

import type {
  PersonAccessRole,
  PersonDetail,
  PersonLinkedChild,
  PersonStatus,
  PersonType,
} from "@/lib/people/types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PhotoLightbox } from "@/components/ui/photo-lightbox"
import { PhotoCapture } from "@/components/kids/photo-capture"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { KidEditDialog } from "./kid-edit-dialog"

interface MemberDetailClientProps {
  person: PersonDetail
  cells: { id: string; name: string }[]
  responsibleOptions: { id: string; name: string }[]
  canManageKids: boolean
}

const statusColors: Record<PersonStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
  visitor: "bg-info/10 text-info border-info/20",
}

const ministryRoleLabels: Record<string, string> = {
  member: "Membro",
  leader: "Líder",
  coordinator: "Coordenador",
}

const volunteerStatusLabels: Record<string, string> = {
  pending: "Pendente",
  active: "Ativo",
  inactive: "Inativo",
  suspended: "Suspenso",
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

const genderLabels: Record<string, string> = {
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

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  try {
    return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
  } catch {
    return "-"
  }
}

function formatDateTime(value: string | null | undefined) {
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

function formatDocument(doc: string | null | undefined) {
  if (!doc) return "-"
  const cleaned = doc.replace(/\D/g, "")
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`
  }
  if (cleaned.length === 14) {
    return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`
  }
  return doc
}

function calculateAgeText(birthDate: string | null | undefined) {
  if (!birthDate) return null
  try {
    const d = parseISO(birthDate)
    const now = new Date()
    let years = now.getFullYear() - d.getFullYear()
    const monthDiff = now.getMonth() - d.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) {
      years--
    }
    if (years < 0) return null
    if (years === 0) {
      let months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
      if (now.getDate() < d.getDate()) months--
      if (months <= 0) return "Menos de 1 mês"
      return `${months} ${months === 1 ? "mês" : "meses"}`
    }
    return `${years} ${years === 1 ? "ano" : "anos"}`
  } catch {
    return null
  }
}

function formatKidAge(child: PersonLinkedChild) {
  if (child.ageLabel) return child.ageLabel
  return calculateAgeText(child.birthDate) ?? "-"
}

function DetailItem({
  icon: Icon,
  label,
  value,
  subValue,
  badge,
  className,
}: {
  icon: typeof UserRound
  label: string
  value: React.ReactNode
  subValue?: string | null
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3.5 transition-colors hover:border-primary/20 min-h-[4.75rem]",
        className,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {badge}
        </div>
        <div className="mt-0.5 break-words text-sm font-semibold text-foreground">{value}</div>
        {subValue && <p className="mt-0.5 text-xs text-muted-foreground">{subValue}</p>}
      </div>
    </div>
  )
}

export function MemberDetailClient({ person, cells,  canManageKids }: MemberDetailClientProps) {
  const router = useRouter()
  const { hasRole } = useAuth()
  const canInviteAccess = hasRole(["superadmin", "admin", "pastor"])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [accessRole, setAccessRole] = useState<PersonAccessRole>(person.accessRole ?? "member")
  const [cellIds, setCellIds] = useState<string[]>(person.cellIds)
  const [temporaryPassword, setTemporaryPassword] = useState("")
  const [kidEditChild, setKidEditChild] = useState<PersonLinkedChild | null>(null)

  // Activity assignment state
  const [assignActivityOpen, setAssignActivityOpen] = useState(false)
  const [selectedActivityId, setSelectedActivityId] = useState("")
  const [isAssigningActivity, setIsAssigningActivity] = useState(false)

  // Journey enrollment state




  // Step toggle & note modal state




  // Photo management & lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [childLightbox, setChildLightbox] = useState<{ url: string; title: string; subtitle?: string } | null>(null)
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [isSavingPhoto, setIsSavingPhoto] = useState(false)

  const handleSavePhoto = async () => {
    if (!photoFile) return
    setIsSavingPhoto(true)
    try {
      const fd = new FormData()
      fd.set("personId", person.id)
      fd.set("file", photoFile)
      const res = await savePersonPhoto(fd)
      if (res.ok) {
        toast.success("Foto atualizada com sucesso!")
        setPhotoDialogOpen(false)
        setPhotoFile(null)
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao salvar foto")
      }
    } catch {
      toast.error("Erro inesperado ao salvar foto")
    } finally {
      setIsSavingPhoto(false)
    }
  }

  const handleRemovePhoto = async () => {
    setIsSavingPhoto(true)
    try {
      const fd = new FormData()
      fd.set("personId", person.id)
      fd.set("remove", "true")
      const res = await savePersonPhoto(fd)
      if (res.ok) {
        toast.success("Foto removida com sucesso!")
        setPhotoDialogOpen(false)
        setPhotoFile(null)
        router.refresh()
      } else {
        toast.error(res.error || "Erro ao remover foto")
      }
    } catch {
      toast.error("Erro inesperado ao remover foto")
    } finally {
      setIsSavingPhoto(false)
    }
  }

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









  const assignableActivities = (person.availableActivities ?? []).filter(
    (act) => !person.activities.some((pa) => pa.activityId === act.id),
  )




  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <Button render={<Link href="/pessoas" />} nativeButton={false} variant="outline" className="w-fit">
            <ArrowLeft className="h-4 w-4" />
            Pessoas
          </Button>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative group shrink-0">
              <Avatar
                className={`h-16 w-16 border-2 border-border/60 ${person.photoUrl ? "cursor-zoom-in hover:ring-2 hover:ring-primary/50 transition-all" : ""}`}
                onClick={() => {
                  if (person.photoUrl) setLightboxOpen(true)
                }}
                title={person.photoUrl ? "Clique para ver a foto em tela inteira" : undefined}
              >
                {person.photoUrl && <AvatarImage src={person.photoUrl} alt={person.fullName} />}
                <AvatarFallback className="gradient-primary text-lg text-white">
                  {initials(person.fullName)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                className="absolute -bottom-1 -right-1 rounded-full bg-primary p-1 text-primary-foreground shadow hover:bg-primary/90 transition-all cursor-pointer"
                onClick={() => setPhotoDialogOpen(true)}
                title="Alterar ou gerenciar foto"
                aria-label="Alterar foto"
              >
                <Edit3 className="h-3 w-3" />
              </button>
            </div>
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
            <TabsList className="w-full justify-start overflow-x-auto h-auto p-1 bg-muted/40 gap-1">
              <TabsTrigger value="perfil" className="gap-1.5 py-2">
                <UserRound className="h-4 w-4" />
                <span>Perfil</span>
              </TabsTrigger>
              <TabsTrigger value="kids" className="gap-1.5 py-2">
                <Baby className="h-4 w-4" />
                <span>Filhos / Kids</span>
                {person.linkedChildren && person.linkedChildren.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-[10px] font-bold bg-primary/15 text-primary border-primary/20"
                  >
                    {person.linkedChildren.length}
                  </Badge>
                )}
                {person.linkedGuardians && person.linkedGuardians.length > 0 && !person.linkedChildren?.length && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-[10px] font-bold bg-info/15 text-info border-info/20"
                  >
                    {person.linkedGuardians.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-1.5 py-2">
                <Activity className="h-4 w-4" />
                <span>Histórico pastoral</span>
              </TabsTrigger>
              <TabsTrigger value="jornada" className="gap-1.5 py-2">
                <Route className="h-4 w-4" />
                <span>Jornada</span>
              </TabsTrigger>
              <TabsTrigger value="linha-do-tempo" className="gap-1.5 py-2">
                <ClipboardList className="h-4 w-4" />
                <span>Linha do tempo</span>
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
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <DetailItem
                      icon={Mail}
                      label="E-mail"
                      value={infoValue(person.email)}
                      badge={
                        person.emailValidated ? (
                          <Badge variant="outline" className="border-success/30 text-success text-[10px] px-1.5 py-0">
                            Validado
                          </Badge>
                        ) : null
                      }
                    />
                    <DetailItem
                      icon={Phone}
                      label="Telefone / WhatsApp"
                      value={
                        person.phone ? (
                          <a
                            href={`https://wa.me/55${person.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-primary inline-flex items-center gap-1.5 font-medium"
                            title="Abrir no WhatsApp"
                          >
                            {formatBrazilianWhatsapp(person.phone) || person.phone}
                            <ExternalLink className="h-3 w-3 opacity-70" />
                          </a>
                        ) : (
                          "-"
                        )
                      }
                    />
                    <DetailItem
                      icon={Cake}
                      label="Data de Nascimento"
                      value={formatDate(person.birthDate)}
                      subValue={calculateAgeText(person.birthDate)}
                    />
                    <DetailItem
                      icon={UserRound}
                      label="Gênero"
                      value={genderLabels[person.gender ?? "not_informed"] ?? "Não informado"}
                    />
                    <DetailItem
                      icon={FileText}
                      label="Documento (CPF / RG)"
                      value={formatDocument(person.document)}
                    />
                    <DetailItem
                      icon={Church}
                      label="Congregação"
                      value={person.congregationName ?? "Sem congregação"}
                    />

                    {/* Endereço Residencial em largura completa */}
                    <div className="md:col-span-2 rounded-xl border border-border/50 bg-background/50 p-4 transition-colors hover:border-primary/20">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-muted-foreground">Endereço Residencial</p>
                          {person.address || person.postalCode ? (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-sm font-semibold text-foreground">
                                {[person.address, person.addressNumber].filter(Boolean).join(", ")}
                                {person.addressComplement && ` - ${person.addressComplement}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {[
                                  person.neighborhood,
                                  [person.city, person.state].filter(Boolean).join(" - "),
                                  person.postalCode && `CEP ${person.postalCode}`,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-sm font-medium text-muted-foreground">Endereço não informado</p>
                          )}
                        </div>
                      </div>
                    </div>
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
                        <div key={field.fieldId} className="rounded-xl border border-border/50 bg-background/50 p-3.5 transition-colors hover:border-primary/20 min-h-[4.5rem]">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground">{field.name}</p>
                            {field.sourceModule === "kids" && (
                              <Badge variant="outline" className="border-info/30 text-info text-[10px] py-0">
                                Kids · {field.kidsTargets.map((target) => (target === "child" ? "Criança" : "Responsável")).join("/")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 break-words text-sm font-semibold text-foreground">{field.value || "Sem valor"}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum campo personalizado ativo.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Participação
                  </CardTitle>
                  <CardDescription>Ministérios, células e voluntariado desta pessoa.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        Ministérios
                      </p>
                      {person.participation.ministries.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum ministério ativo.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {person.participation.ministries.map((ministry) => (
                            <div key={ministry.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate font-medium" title={ministry.name}>{ministry.name}</span>
                              <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                                {ministryRoleLabels[ministry.role] ?? ministry.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <UsersRound className="h-3.5 w-3.5 text-primary" />
                        Células
                      </p>
                      {person.participation.cells.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Não participa de células.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {person.participation.cells.map((cell) => (
                            <div key={cell.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate font-medium" title={cell.name}>{cell.name}</span>
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 shrink-0 ${cell.role === "leader" ? "border-primary/30 text-primary" : ""}`}
                              >
                                {cell.role === "leader" ? "Líder" : "Membro"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <HeartPulse className="h-3.5 w-3.5 text-primary" />
                        Voluntariado
                      </p>
                      {!person.participation.volunteering ? (
                        <p className="text-xs text-muted-foreground">Sem perfil de voluntário.</p>
                      ) : (
                        <div className="space-y-1.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] py-0 ${
                              person.participation.volunteering.registrationStatus === "active"
                                ? "border-success/30 text-success"
                                : "border-muted-foreground/30 text-muted-foreground"
                            }`}
                          >
                            {volunteerStatusLabels[person.participation.volunteering.registrationStatus] ??
                              person.participation.volunteering.registrationStatus}
                          </Badge>
                          {person.participation.volunteering.departments.map((department) => (
                            <p key={department} className="text-xs text-muted-foreground">{department}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="kids" className="mt-4 space-y-4">
              {/* Se houver filhos cadastrados sob responsabilidade */}
              {person.linkedChildren && person.linkedChildren.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                        <Baby className="h-5 w-5 text-primary" />
                        Filhos cadastrados no Altar Kids ({person.linkedChildren.length})
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Crianças vinculadas a {person.fullName} com informações de segurança, retirada e saúde.
                      </p>
                    </div>
                    <Button
                      render={<Link href="/kids" />}
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      className="w-fit"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Acessar Módulo Kids
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    {person.linkedChildren.map((child) => {
                      const health = child.health
                      const hasHealthAlerts =
                        health.hasAllergy ||
                        health.hasDietaryRestriction ||
                        health.hasMedication ||
                        health.hasSpecialNeeds ||
                        Boolean(
                          health.details?.allergies ||
                            health.details?.dietaryRestrictions ||
                            health.details?.medication ||
                            health.details?.specialNeeds ||
                            health.details?.instructions,
                        )

                      const hasPhotoConsent = child.grantedConsents.includes("image_use")
                      const hasMedicalConsent = child.grantedConsents.includes("emergency_care")
                      const hasDataConsent = child.grantedConsents.includes("data_processing")
                      const hasCommunicationConsent = child.grantedConsents.includes("communication")

                      return (
                        <Card
                          key={child.kidId}
                          className="glass overflow-hidden border-border/60 hover:border-primary/30 transition-all shadow-sm"
                        >
                          <CardHeader className="bg-muted/10 pb-4 border-b border-border/40">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-3.5 min-w-0">
                                <Avatar
                                  className={`h-14 w-14 border-2 border-border/60 shadow-sm ${
                                    child.photoUrl
                                      ? "cursor-zoom-in hover:ring-2 hover:ring-primary/50 transition-all"
                                      : ""
                                  }`}
                                  onClick={() => {
                                    if (child.photoUrl) {
                                      setChildLightbox({
                                        url: child.photoUrl,
                                        title: child.fullName,
                                        subtitle: `${child.relationshipLabel || "Filho(a)"} · ${formatKidAge(child)}`,
                                      })
                                    }
                                  }}
                                  title={child.photoUrl ? "Clique para ver a foto em tamanho maior" : undefined}
                                >
                                  {child.photoUrl && <AvatarImage src={child.photoUrl} alt={child.fullName} />}
                                  <AvatarFallback className="bg-gradient-to-br from-pink-500/20 to-purple-500/20 text-foreground font-semibold text-base">
                                    {initials(child.fullName)}
                                  </AvatarFallback>
                                </Avatar>

                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-bold text-foreground break-words">{child.fullName}</h3>
                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
                                      {child.relationshipLabel || child.relationship || "Filho(a)"}
                                    </Badge>
                                    {child.isPrimary && (
                                      <Badge
                                        variant="outline"
                                        className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[11px]"
                                      >
                                        Responsável Principal
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                                      <Cake className="h-3.5 w-3.5 text-primary" />
                                      {formatKidAge(child)} ({formatDate(child.birthDate)})
                                    </span>
                                    {child.gender && (
                                      <span>· {genderLabels[child.gender] ?? child.gender}</span>
                                    )}
                                    {child.congregationName && (
                                      <span className="inline-flex items-center gap-1">
                                        · <Church className="h-3.5 w-3.5 text-muted-foreground" /> {child.congregationName}
                                      </span>
                                    )}
                                    {child.createdByName && (
                                      <span title={`Cadastro criado em ${formatDate(child.createdAt)}`}>
                                        · Cadastrada por {child.createdByName} em {formatDate(child.createdAt)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                {canManageKids && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => setKidEditChild(child)}
                                  >
                                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                                    Editar
                                  </Button>
                                )}
                                <Button
                                  render={<Link href={`/pessoas/${child.personId}`} />}
                                  nativeButton={false}
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                >
                                  <UserRound className="mr-1.5 h-3.5 w-3.5" />
                                  Ver perfil completo
                                </Button>
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent className="pt-4 space-y-4">
                            {/* Grid com Permissões & Cuidados */}
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {/* Card Permissões de Retirada */}
                              <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                                  Retirada e Segurança
                                </p>
                                <div className="space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Pode retirar no Kids:</span>
                                    {child.canCheckout ? (
                                      <Badge
                                        variant="outline"
                                        className="border-success/30 text-success bg-success/5 font-semibold text-[11px] gap-1"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Sim
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="border-destructive/30 text-destructive bg-destructive/5 font-semibold text-[11px] gap-1"
                                      >
                                        <XCircle className="h-3 w-3" /> Não
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Pode fazer check-in:</span>
                                    {child.canCheckin ? (
                                      <Badge
                                        variant="outline"
                                        className="border-success/30 text-success bg-success/5 font-semibold text-[11px] gap-1"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Sim
                                      </Badge>
                                    ) : (
                                      <span className="font-medium text-muted-foreground">Não</span>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Contato de emergência:</span>
                                    {child.isEmergencyContact ? (
                                      <Badge
                                        variant="outline"
                                        className="border-success/30 text-success bg-success/5 font-semibold text-[11px] gap-1"
                                      >
                                        <CheckCircle2 className="h-3 w-3" /> Sim
                                      </Badge>
                                    ) : (
                                      <span className="font-medium text-muted-foreground">Não</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Card Termos e Consentimentos */}
                              <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                  <FileCheck2 className="h-3.5 w-3.5 text-primary" />
                                  Consentimentos
                                </p>
                                <div className="space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Tratamento de dados:</span>
                                    <span
                                      className={`font-semibold ${hasDataConsent ? "text-success" : "text-muted-foreground"}`}
                                    >
                                      {hasDataConsent ? "Autorizado" : "Não informado"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Uso de foto / imagem:</span>
                                    <span
                                      className={`font-semibold ${hasPhotoConsent ? "text-success" : "text-muted-foreground"}`}
                                    >
                                      {hasPhotoConsent ? "Autorizado" : "Não informado"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Atendimento emergencial:</span>
                                    <span
                                      className={`font-semibold ${hasMedicalConsent ? "text-success" : "text-muted-foreground"}`}
                                    >
                                      {hasMedicalConsent ? "Autorizado" : "Não informado"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Comunicação:</span>
                                    <span
                                      className={`font-semibold ${hasCommunicationConsent ? "text-success" : "text-muted-foreground"}`}
                                    >
                                      {hasCommunicationConsent ? "Autorizado" : "Não informado"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Card Outros Responsáveis */}
                              <div className="rounded-xl border border-border/40 bg-background/50 p-3.5 space-y-2 sm:col-span-2 lg:col-span-1">
                                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                  <Users className="h-3.5 w-3.5 text-primary" />
                                  Rede Familiar / Outros Responsáveis
                                </p>
                                {child.otherGuardians && child.otherGuardians.length > 0 ? (
                                  <div className="space-y-2 text-xs">
                                    {child.otherGuardians.map((g, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between gap-2 border-b border-border/30 pb-1.5 last:border-0 last:pb-0"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-semibold text-foreground truncate">{g.name}</p>
                                          <p className="text-[11px] text-muted-foreground">
                                            {g.relationshipLabel || g.relationship || "Responsável"}
                                          </p>
                                        </div>
                                        {g.phone && (
                                          <a
                                            href={`https://wa.me/55${g.phone.replace(/\D/g, "")}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-primary hover:underline shrink-0 font-medium"
                                          >
                                            {formatBrazilianWhatsapp(g.phone)}
                                          </a>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Apenas {person.firstName} cadastrado(a) no Kids.
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Prontuário de Saúde & Alertas Médicos */}
                            <div
                              className={`rounded-xl border p-3.5 space-y-2.5 ${
                                hasHealthAlerts
                                  ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/10"
                                  : "border-border/40 bg-background/40"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <HeartPulse
                                    className={`h-4 w-4 ${hasHealthAlerts ? "text-amber-500" : "text-muted-foreground"}`}
                                  />
                                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                                    Prontuário de Saúde & Alergias
                                  </span>
                                </div>
                                {hasHealthAlerts && (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[10px] font-semibold"
                                  >
                                    Atenção necessária
                                  </Badge>
                                )}
                              </div>

                              {health.details?.allergies ? (
                                <div className="space-y-1 pt-1">
                                  <span className="text-xs font-semibold text-destructive flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Alergias relatadas:
                                  </span>
                                  <p className="text-xs font-medium text-foreground bg-destructive/10 rounded-md p-2 border border-destructive/20">
                                    {health.details.allergies}
                                  </p>
                                </div>
                              ) : health.hasAllergy ? (
                                <div className="pt-1">
                                  <Badge variant="destructive" className="text-xs font-medium">
                                    Possui alergias (detalhes não informados)
                                  </Badge>
                                </div>
                              ) : null}

                              {health.details?.dietaryRestrictions && (
                                <p className="text-xs text-foreground/90 pt-0.5">
                                  <strong className="text-foreground">Restrições alimentares:</strong>{" "}
                                  {health.details.dietaryRestrictions}
                                </p>
                              )}

                              {health.details?.medication && (
                                <p className="text-xs text-foreground/90 pt-0.5">
                                  <strong className="text-foreground">Medicação contínua:</strong>{" "}
                                  {health.details.medication}
                                </p>
                              )}

                              {health.details?.specialNeeds && (
                                <p className="text-xs text-foreground/90 pt-0.5">
                                  <strong className="text-foreground">Necessidades especiais:</strong>{" "}
                                  {health.details.specialNeeds}
                                </p>
                              )}

                              {health.details?.instructions && (
                                <p className="text-xs text-foreground/90 pt-0.5">
                                  <strong className="text-foreground">Instruções de cuidado:</strong>{" "}
                                  {health.details.instructions}
                                </p>
                              )}

                              {!hasHealthAlerts && (
                                <p className="text-xs text-muted-foreground">
                                  Nenhuma alergia, restrição alimentar ou condição médica informada pelos responsáveis.
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ) : person.linkedGuardians && person.linkedGuardians.length > 0 ? (
                /* Caso este perfil seja de uma criança vinculada a responsáveis */
                <div className="space-y-4">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Responsáveis Cadastrados no Altar Kids ({person.linkedGuardians.length})
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Pessoas autorizadas a retirar ou contatar a respeito de {person.fullName}.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {person.linkedGuardians.map((guardian) => (
                      <Card key={guardian.guardianId} className="glass">
                        <CardContent className="p-4 flex items-start gap-3">
                          <Avatar className="h-12 w-12 border">
                            {guardian.photoUrl && (
                              <AvatarImage src={guardian.photoUrl} alt={guardian.fullName} />
                            )}
                            <AvatarFallback className="gradient-primary text-white">
                              {initials(guardian.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="font-semibold text-sm truncate">{guardian.fullName}</p>
                              <Badge className="bg-primary/10 text-primary text-[10px]">
                                {guardian.relationshipLabel || guardian.relationship}
                              </Badge>
                              {guardian.isPrimary && (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px]">
                                  Principal
                                </Badge>
                              )}
                            </div>
                            {guardian.phone && (
                              <p className="text-xs text-muted-foreground">
                                Telefone: {formatBrazilianWhatsapp(guardian.phone)}
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-1 text-xs">
                              {guardian.canCheckout ? (
                                <Badge variant="outline" className="border-success/30 text-success text-[10px]">
                                  Pode retirar
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-destructive/30 text-destructive text-[10px]">
                                  Não pode retirar
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                /* Estado Vazio */
                <Card className="glass">
                  <CardContent className="py-12 text-center space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Baby className="h-7 w-7" />
                    </div>
                    <div className="space-y-1 max-w-md mx-auto">
                      <h3 className="text-base font-semibold">Nenhuma criança ou vínculo familiar no Kids</h3>
                      <p className="text-sm text-muted-foreground">
                        {person.fullName} ainda não possui filhos cadastrados no Altar Kids sob sua responsabilidade.
                      </p>
                    </div>
                    <Button
                      render={<Link href="/kids" />}
                      nativeButton={false}
                      variant="outline"
                      size="sm"
                      className="mt-2"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Acessar Módulo Kids
                    </Button>
                  </CardContent>
                </Card>
              )}
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

            <TabsContent value="jornada" className="mt-4"><Card><CardContent className="space-y-3 p-5"><p className="font-semibold">Histórico de trilhas arquivado</p><p className="text-sm text-muted-foreground">Consulte os registros preservados no módulo Automações.</p><Button render={<Link href="/automacoes?tab=Hist%C3%B3rico%20arquivado" />} nativeButton={false}>Consultar histórico</Button></CardContent></Card></TabsContent>

            <TabsContent value="linha-do-tempo" className="mt-4">
              <Card><CardContent className="space-y-3 p-5"><p className="font-semibold">Automações e acompanhamento</p><p className="text-sm text-muted-foreground">Os fluxos e tarefas agora ficam no módulo Automações. A linha do tempo preserva os registros anteriores.</p><Button render={<Link href="/automacoes" />} nativeButton={false}>Abrir automações</Button></CardContent></Card>
              <Card className="mt-4"><CardContent className="space-y-3 p-5"><h3 className="font-semibold">Linha do tempo</h3>{person.timeline.length===0?<p className="text-sm text-muted-foreground">Nenhum registro no histórico.</p>:person.timeline.map(item=><div key={`${item.kind}:${item.id}`} className="border-l-2 border-primary/30 pl-3"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString("pt-BR")} · {item.source}</p>{item.description&&<p className="mt-1 whitespace-pre-wrap text-sm">{item.description}</p>}</div>)}</CardContent></Card>
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
              {person.hasSystemAccess ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Último login</span>
                  <span className="text-right font-medium">
                    {person.lastLoginAt ? formatDateTime(person.lastLoginAt) : "Nunca fez login"}
                  </span>
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
                <span className="font-medium">{formatDocument(person.document)}</span>
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

      {/* Dialog para alterar/gerenciar foto da pessoa */}
      <Dialog open={photoDialogOpen} onOpenChange={setPhotoDialogOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Foto de {person.fullName}</DialogTitle>
            <DialogDescription>
              Tire ou escolha uma foto e ajuste o enquadramento na bolinha.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <PhotoCapture
              label={person.firstName}
              currentUrl={person.photoUrl}
              value={photoFile}
              disabled={isSavingPhoto}
              onChange={(file, removed) => {
                setPhotoFile(file)
                if (removed) {
                  void handleRemovePhoto()
                }
              }}
              onError={(err) => toast.error(err)}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPhotoDialogOpen(false)} disabled={isSavingPhoto}>
              Fechar
            </Button>
            {photoFile && (
              <Button onClick={() => void handleSavePhoto()} disabled={isSavingPhoto} className="gradient-primary">
                {isSavingPhoto ? "Salvando..." : "Salvar foto"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox para foto em tela inteira */}
      <PhotoLightbox
        open={lightboxOpen}
        url={person.photoUrl}
        title={person.fullName}
        subtitle={person.email ?? person.phone}
        onClose={() => setLightboxOpen(false)}
      />

      {/* Lightbox para foto da criança */}
      {childLightbox && (
        <PhotoLightbox
          open={Boolean(childLightbox)}
          url={childLightbox.url}
          title={childLightbox.title}
          subtitle={childLightbox.subtitle}
          onClose={() => setChildLightbox(null)}
        />
      )}

      {/* Edição completa da criança (mesmas actions do módulo Kids) */}
      {kidEditChild && (
        <KidEditDialog
          child={kidEditChild}
          open={Boolean(kidEditChild)}
          onOpenChange={(open) => {
            if (!open) setKidEditChild(null)
          }}
        />
      )}
    </div>
  )
}
