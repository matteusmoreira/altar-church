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
  CalendarDays,
  Cake,
  CheckCircle2,
  Circle,
  Church,
  ClipboardList,
  FileText,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Route,
  ShieldCheck,
  UserRound,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { invitePersonAccess } from "../actions"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface MemberDetailClientProps {
  person: PersonDetail
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
  reader: "Leitor",
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

export function MemberDetailClient({ person }: MemberDetailClientProps) {
  const router = useRouter()
  const { hasRole } = useAuth()
  const canInviteAccess = hasRole(["superadmin", "admin", "pastor"])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [accessRole, setAccessRole] = useState<PersonAccessRole>(person.accessRole ?? "reader")
  const [temporaryPassword, setTemporaryPassword] = useState("")

  const completedSteps = person.journeySteps.filter((step) => step.completedAt).length
  const totalSteps = person.journeySteps.length
  const journeyProgress = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const handleInvite = async () => {
    if (!person.email?.trim()) {
      toast.error("Informe um e-mail na pessoa antes de convidar o acesso")
      return
    }
    if (temporaryPassword.length < 8) {
      toast.error("Senha temporária deve ter no mínimo 8 caracteres")
      return
    }

    setIsInviting(true)
    const result = await invitePersonAccess({
      personId: person.id,
      companyId: person.companyId,
      role: accessRole,
      temporaryPassword,
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
                    <DetailItem icon={MapPin} label="Endereço" value={[person.address, person.city, person.state].filter(Boolean).join(", ") || "-"} />
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Histórico pastoral
                  </CardTitle>
                  <CardDescription>Atividades e vínculos ministeriais desta pessoa.</CardDescription>
                </CardHeader>
                <CardContent>
                  {person.activities.length > 0 ? (
                    <div className="space-y-3">
                      {person.activities.map((activity) => (
                        <div key={activity.id} className="flex gap-3 rounded-lg border border-border/40 p-3">
                          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">{activity.description}</p>
                              <Badge variant="outline">
                                {activityCategoryLabels[activity.category] ?? activity.category}
                              </Badge>
                              {!activity.isActive && <Badge variant="destructive">Inativa</Badge>}
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Atribuída em {formatDateTime(activity.assignedAt)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma atividade atribuída ainda.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="jornada" className="mt-4">
              <Card className="glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Route className="h-5 w-5 text-primary" />
                    Jornada de integração
                  </CardTitle>
                  <CardDescription>{completedSteps} de {totalSteps} etapa(s) concluída(s).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${journeyProgress}%` }}
                    />
                  </div>

                  {person.journeySteps.length > 0 ? (
                    <div className="space-y-3">
                      {person.journeySteps.map((step) => {
                        const done = Boolean(step.completedAt)
                        return (
                          <div key={step.stepId} className="flex gap-3 rounded-lg border border-border/40 p-3">
                            {done ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                            ) : (
                              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">{step.stepName}</p>
                                <Badge variant="outline">{step.journeyName}</Badge>
                              </div>
                              {step.description && (
                                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                              )}
                              <p className="mt-2 text-xs text-muted-foreground">
                                {done ? `Concluída em ${formatDateTime(step.completedAt)}` : "Pendente"}
                              </p>
                              {step.notes && (
                                <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                                  {step.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma jornada ativa configurada.</p>
                  )}
                </CardContent>
              </Card>
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
                    setAccessRole(person.accessRole ?? "reader")
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
    </div>
  )
}
