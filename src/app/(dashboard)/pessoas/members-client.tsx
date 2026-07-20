"use client"

import Link from "next/link"
import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  AlertTriangle,
  Baby,
  BarChart3,
  Cake,
  CheckCircle2,
  Edit,
  Eye,
  FileText,
  List,
  MoreVertical,
  Plus,
  Route,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { deletePerson, resolveDuplicateCandidate, savePerson } from "./actions"
import type {
  DuplicateCandidateItem,
  DuplicateCandidateResolution,
  PeopleDashboardData,
  PeopleListFilters,
  PeopleListResult,
  PersonAccessRole,
  PersonFormOptions,
  PersonGender,
  PersonListItem,
  PersonStatus,
  PersonType,
} from "@/lib/people/types"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface MembersClientProps {
  dashboard: PeopleDashboardData
  duplicateCandidates: DuplicateCandidateItem[]
  filters: PeopleListFilters
  formOptions: PersonFormOptions
  peopleResult: PeopleListResult
}

interface PersonFormState {
  id: string | null
  companyId: string | null
  fullName: string
  email: string
  phone: string
  birthDate: string
  gender: PersonGender
  congregationId: string
  status: PersonStatus
  personType: PersonType
  address: string
  city: string
  state: string
  baptized: boolean
  emailValidated: boolean
  isActive: boolean
  internalNotes: string
  inviteAccess: boolean
  accessRole: PersonAccessRole
  temporaryPassword: string
  hasSystemAccess: boolean
}

interface FilterState {
  search: string
  status: string
  personType: string
  congregationId: string
  baptized: string
  emailValidated: string
  isActive: string
  kidsRole: string
}

const statusColors: Record<PersonStatus, string> = {
  active: "bg-success/10 text-success border-success/20",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
  visitor: "bg-info/10 text-info border-info/20",
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

const emptyForm: PersonFormState = {
  id: null,
  companyId: null,
  fullName: "",
  email: "",
  phone: "",
  birthDate: "",
  gender: "not_informed",
  congregationId: "none",
  status: "active",
  personType: "member",
  address: "",
  city: "",
  state: "",
  baptized: false,
  emailValidated: false,
  isActive: true,
  internalNotes: "",
  inviteAccess: false,
  accessRole: "member",
  temporaryPassword: "",
  hasSystemAccess: false,
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
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" "),
  }
}

function toFilterChoice(value: boolean | null | undefined) {
  if (value === true) return "yes"
  if (value === false) return "no"
  return "all"
}

function personToForm(person: PersonListItem): PersonFormState {
  return {
    id: person.id,
    companyId: person.companyId,
    fullName: person.fullName,
    email: person.email ?? "",
    phone: person.phone,
    birthDate: person.birthDate ?? "",
    gender: person.gender ?? "not_informed",
    congregationId: person.congregationId ?? "none",
    status: person.status,
    personType: person.personType,
    address: person.address,
    city: person.city,
    state: person.state,
    baptized: person.baptized,
    emailValidated: person.emailValidated,
    isActive: person.isActive,
    internalNotes: "",
    inviteAccess: false,
    accessRole: person.accessRole ?? "member",
    temporaryPassword: "",
    hasSystemAccess: person.hasSystemAccess,
  }
}

function DuplicatePersonPanel({
  label,
  person,
}: {
  label: string
  person: DuplicateCandidateItem["primaryPerson"]
}) {
  return (
    <div className="rounded-lg border border-border/40 p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="gradient-primary text-xs text-white">
            {initials(person.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <Link
            href={`/pessoas/${person.id}`}
            className="mt-1 block truncate font-medium transition-colors hover:text-primary"
          >
            {person.fullName}
          </Link>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p className="truncate">{person.email ?? "Sem e-mail"}</p>
            <p>{person.phone || "Sem telefone"}</p>
            <p>{person.congregationName ?? "Sem congregação"}</p>
            <p>Nascimento: {formatDate(person.birthDate)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MembersClient({
  dashboard,
  duplicateCandidates,
  filters,
  formOptions,
  peopleResult,
}: MembersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { hasRole } = useAuth()
  const canInviteAccess = hasRole(["superadmin", "admin", "pastor"])
  const [activeTab, setActiveTab] = useState("lista")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [resolvingDuplicateId, setResolvingDuplicateId] = useState<string | null>(null)
  const [deletingPerson, setDeletingPerson] = useState<PersonListItem | null>(null)
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState<PersonFormState>(emptyForm)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    status: filters.status ?? "all",
    personType: filters.personType ?? "all",
    congregationId: filters.congregationId ?? "all",
    baptized: toFilterChoice(filters.baptized),
    emailValidated: toFilterChoice(filters.emailValidated),
    isActive: toFilterChoice(filters.isActive),
    kidsRole: filters.kidsRole ?? "all",
  })

  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim())
    if (nextFilters.status !== "all") params.set("status", nextFilters.status)
    if (nextFilters.personType !== "all") params.set("personType", nextFilters.personType)
    if (nextFilters.congregationId !== "all") params.set("congregationId", nextFilters.congregationId)
    if (nextFilters.baptized !== "all") params.set("baptized", nextFilters.baptized)
    if (nextFilters.emailValidated !== "all") params.set("emailValidated", nextFilters.emailValidated)
    if (nextFilters.isActive !== "all") params.set("isActive", nextFilters.isActive)
    if (nextFilters.kidsRole !== "all") params.set("kidsRole", nextFilters.kidsRole)
    if (page > 1) params.set("page", String(page))

    const query = params.toString()
    setSelectedPersonIds(new Set())
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const selectedPeople = peopleResult.people.filter((person) => selectedPersonIds.has(person.id))
  const allPagePeopleSelected =
    peopleResult.people.length > 0 && selectedPeople.length === peopleResult.people.length

  const togglePersonSelection = (personId: string) => {
    setSelectedPersonIds((current) => {
      const next = new Set(current)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  const togglePageSelection = () => {
    setSelectedPersonIds(
      allPagePeopleSelected ? new Set() : new Set(peopleResult.people.map((person) => person.id)),
    )
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState)
  }

  const openCreateDialog = () => {
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (person: PersonListItem) => {
    setFormData(personToForm(person))
    setDialogOpen(true)
  }

  const openDetail = (person: PersonListItem) => {
    router.push(`/pessoas/${person.id}`)
  }

  const handleSave = async () => {
    const fullName = formData.fullName.trim()
    if (!fullName) {
      toast.error("Informe o nome da pessoa")
      return
    }

    if (formData.inviteAccess) {
      if (!formData.email.trim()) {
        toast.error("Informe um e-mail para convidar o acesso")
        return
      }
      if (!formData.temporaryPassword || formData.temporaryPassword.length < 8) {
        toast.error("Senha temporária deve ter no mínimo 8 caracteres")
        return
      }
    }

    setIsSaving(true)
    const { firstName, lastName } = splitFullName(fullName)
    const result = await savePerson({
      id: formData.id,
      companyId: formData.companyId,
      firstName,
      lastName,
      fullName,
      email: formData.email,
      phone: formData.phone,
      birthDate: formData.birthDate,
      gender: formData.gender,
      congregationId: formData.congregationId === "none" ? null : formData.congregationId,
      status: formData.status,
      personType: formData.personType,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      baptized: formData.baptized,
      emailValidated: formData.emailValidated,
      isActive: formData.isActive,
      internalNotes: formData.internalNotes,
      inviteAccess: formData.inviteAccess,
      accessRole: formData.inviteAccess ? formData.accessRole : undefined,
      temporaryPassword: formData.inviteAccess ? formData.temporaryPassword : undefined,
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a pessoa")
      return
    }

    if (formData.inviteAccess) {
      toast.success(
        formData.hasSystemAccess
          ? "Pessoa salva e acesso atualizado. Informe a senha temporária à pessoa."
          : "Pessoa salva e acesso criado. Informe a senha temporária à pessoa.",
      )
    } else {
      toast.success(formData.id ? "Pessoa atualizada com sucesso" : "Pessoa cadastrada com sucesso")
    }
    setDialogOpen(false)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    const peopleToDelete = deletingPerson ? [deletingPerson] : selectedPeople
    if (peopleToDelete.length === 0) return

    setIsDeleting(true)
    const results = []
    for (const person of peopleToDelete) {
      const result = await deletePerson({
        id: person.id,
        companyId: person.companyId,
      })
      results.push({ person, result })
    }
    setIsDeleting(false)

    const failed = results.filter(({ result }) => !result.ok)
    const removedCount = results.length - failed.length

    if (failed.length > 0) {
      const firstError = failed[0]?.result.error
      toast.error(
        removedCount > 0
          ? `${removedCount} removida(s); ${failed.length} não puderam ser excluída(s).`
          : firstError ?? "Não foi possível excluir as pessoas selecionadas",
      )
      setSelectedPersonIds(new Set(failed.map(({ person }) => person.id)))
      setDeleteDialogOpen(false)
      setDeletingPerson(null)
      if (removedCount > 0) router.refresh()
      return
    }

    toast.success(
      peopleToDelete.length === 1
        ? "Pessoa removida com sucesso"
        : `${peopleToDelete.length} pessoas removidas com sucesso`,
    )
    setDeleteDialogOpen(false)
    setDeletingPerson(null)
    setSelectedPersonIds(new Set())
    router.refresh()
  }

  const handleResolveDuplicate = async (
    candidate: DuplicateCandidateItem,
    status: DuplicateCandidateResolution,
  ) => {
    setResolvingDuplicateId(candidate.id)
    const result = await resolveDuplicateCandidate({
      id: candidate.id,
      companyId: candidate.companyId,
      status,
    })
    setResolvingDuplicateId(null)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível atualizar a duplicidade")
      return
    }

    toast.success(status === "ignored" ? "Suspeita ignorada" : "Duplicidade resolvida")
    router.refresh()
  }

  const metricCards = [
    { icon: Users, label: "Pessoas", value: dashboard.total },
    { icon: UserPlus, label: "Ativas", value: dashboard.active },
    { icon: Cake, label: "Batizadas", value: dashboard.baptized },
    { icon: AlertTriangle, label: "Duplicidades", value: dashboard.possibleDuplicates },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pessoas</h1>
          <p className="text-muted-foreground">Cadastro real de membros, visitantes e voluntários.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova pessoa
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => value && setActiveTab(value)}>
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="lista"><List />Lista geral</TabsTrigger>
          <TabsTrigger value="duplicidades"><AlertTriangle />Duplicidades</TabsTrigger>
          <TabsTrigger value="dashboard"><BarChart3 />Dashboard</TabsTrigger>
          <TabsTrigger value="relatorios"><FileText />Relatórios</TabsTrigger>
          <TabsTrigger value="config"><Settings2 />Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
          <Card className="glass">
            <CardHeader>
              <form className="grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={handleFilterSubmit}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, e-mail ou telefone"
                    value={filterState.search}
                    onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
                    className="pl-9 md:pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={filterState.status}
                    onValueChange={(value) => value && setFilterState({ ...filterState, status: value })}
                  >
                    <SelectTrigger className="w-full sm:w-36">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="visitor">Visitante</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterState.personType}
                    onValueChange={(value) => value && setFilterState({ ...filterState, personType: value })}
                  >
                    <SelectTrigger className="w-full sm:w-40">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="visitor">Visitante</SelectItem>
                      <SelectItem value="attendee">Frequentador</SelectItem>
                      <SelectItem value="member">Membro</SelectItem>
                      <SelectItem value="leader">Líder</SelectItem>
                      <SelectItem value="volunteer">Voluntário</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterState.congregationId}
                    onValueChange={(value) => value && setFilterState({ ...filterState, congregationId: value })}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder="Congregação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {formOptions.congregations.map((congregation) => (
                        <SelectItem key={congregation.id} value={congregation.id}>
                          {congregation.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterState.kidsRole}
                    onValueChange={(value) => value && setFilterState({ ...filterState, kidsRole: value })}
                  >
                    <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Vínculo Kids" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos vínculos</SelectItem>
                      <SelectItem value="any">Qualquer Kids</SelectItem>
                      <SelectItem value="child">Criança Kids</SelectItem>
                      <SelectItem value="guardian">Responsável Kids</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterState.baptized}
                    onValueChange={(value) => value && setFilterState({ ...filterState, baptized: value })}
                  >
                    <SelectTrigger className="w-full sm:w-36">
                      <SelectValue placeholder="Batizado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Batismo</SelectItem>
                      <SelectItem value="yes">Batizado</SelectItem>
                      <SelectItem value="no">Não batizado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" variant="outline">
                    Filtrar
                  </Button>
                </div>
              </form>
            </CardHeader>
            <CardContent>
              {dashboard.possibleDuplicates > 0 && (
                <div className="mb-4 flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  <p className="text-sm text-warning">
                    {dashboard.possibleDuplicates} possível
                    {dashboard.possibleDuplicates === 1 ? "" : "is"} duplicidade
                    {dashboard.possibleDuplicates === 1 ? "" : "s"} pendente
                    {dashboard.possibleDuplicates === 1 ? "" : "s"}.
                  </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-warning/30 text-warning hover:bg-warning/10 sm:w-auto"
                    onClick={() => setActiveTab("duplicidades")}
                  >
                    Revisar duplicidades
                  </Button>
                </div>
              )}

              {peopleResult.people.length > 0 && (
                <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas as pessoas desta página"
                      checked={allPagePeopleSelected}
                      onChange={togglePageSelection}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <span className="text-sm font-medium">
                      {selectedPeople.length > 0
                        ? `${selectedPeople.length} selecionada${selectedPeople.length === 1 ? "" : "s"}`
                        : "Selecionar pessoas desta página"}
                    </span>
                  </div>
                  {selectedPeople.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPersonIds(new Set())}
                      >
                        Limpar
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDeletingPerson(null)
                          setDeleteDialogOpen(true)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir selecionadas
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas as pessoas desta página"
                          checked={allPagePeopleSelected}
                          onChange={togglePageSelection}
                          className="h-4 w-4 accent-primary"
                        />
                      </TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Congregação</TableHead>
                      <TableHead>Nascimento</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {peopleResult.people.map((person) => (
                      <TableRow key={person.id} data-state={selectedPersonIds.has(person.id) ? "selected" : undefined}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${person.fullName}`}
                            checked={selectedPersonIds.has(person.id)}
                            onChange={() => togglePersonSelection(person.id)}
                            className="h-4 w-4 accent-primary"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="gradient-primary text-xs text-white">
                                {initials(person.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <Link
                                href={`/pessoas/${person.id}`}
                                className="text-sm font-medium transition-colors hover:text-primary"
                              >
                                {person.fullName}
                              </Link>
                              <p className="text-xs text-muted-foreground">{person.email ?? "Sem e-mail"}</p>
                              {person.hasSystemAccess ? (
                                <Badge variant="outline" className="mt-1 border-success/30 text-success">
                                  Com acesso
                                </Badge>
                              ) : null}
                              {person.kidsRoles.map((role) => (
                                <Badge key={role} variant="outline" className="mt-1 mr-1 border-info/30 text-info">
                                  <Baby className="mr-1 h-3 w-3" />{role === "child" ? "Criança Kids" : "Responsável Kids"}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {personTypeLabels[person.personType]}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {person.congregationName ?? "-"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(person.birthDate)}
                        </TableCell>
                        <TableCell className="text-sm">{person.phone || "-"}</TableCell>
                        <TableCell>
                          <Badge className={statusColors[person.status]}>
                            {statusLabels[person.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetail(person)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(person)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setDeletingPerson(person)
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {peopleResult.people.map((person) => (
                  <div
                    key={person.id}
                    className={`rounded-lg border p-3 ${
                      selectedPersonIds.has(person.id)
                        ? "border-primary/50 bg-primary/5"
                        : "border-border/40"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${person.fullName}`}
                        checked={selectedPersonIds.has(person.id)}
                        onChange={() => togglePersonSelection(person.id)}
                        className="mt-3 h-4 w-4 shrink-0 accent-primary"
                      />
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="gradient-primary text-xs text-white">
                          {initials(person.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/pessoas/${person.id}`}
                          className="block truncate text-sm font-medium transition-colors hover:text-primary"
                        >
                          {person.fullName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{person.phone || person.email || "Sem contato"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge className={statusColors[person.status]}>
                            {statusLabels[person.status]}
                          </Badge>
                          <Badge variant="outline">{personTypeLabels[person.personType]}</Badge>
                          {person.hasSystemAccess ? (
                            <Badge variant="outline" className="border-success/30 text-success">
                              Com acesso
                            </Badge>
                          ) : null}
                          {person.kidsRoles.map((role) => (
                            <Badge key={role} variant="outline" className="border-info/30 text-info">
                              <Baby className="mr-1 h-3 w-3" />{role === "child" ? "Criança Kids" : "Responsável Kids"}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openDetail(person)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(person)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeletingPerson(person)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {peopleResult.people.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">Nenhuma pessoa encontrada</p>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  {peopleResult.total} registro{peopleResult.total === 1 ? "" : "s"} encontrado
                  {peopleResult.total === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={peopleResult.page <= 1}
                    onClick={() => updateRoute(filterState, peopleResult.page - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    disabled={peopleResult.page >= peopleResult.pageCount}
                    onClick={() => updateRoute(filterState, peopleResult.page + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicidades" className="mt-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Duplicidades</h2>
              <p className="text-sm text-muted-foreground">
                Revise cada possível duplicidade antes de consolidar a base de pessoas.
              </p>
            </div>

            {duplicateCandidates.length === 0 ? (
              <Card className="glass">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success/70" />
                  <p className="mt-4 text-sm text-muted-foreground">Nenhuma possível duplicidade aberta.</p>
                </CardContent>
              </Card>
            ) : (
              duplicateCandidates.map((candidate) => {
                const isResolving = resolvingDuplicateId === candidate.id

                return (
                  <Card key={candidate.id} className="glass">
                    <CardHeader className="gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <Badge variant="outline" className="mb-3 gap-1 border-warning/30 text-warning">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          possível duplicidade
                        </Badge>
                        <CardTitle className="text-base">
                          Similaridade de {Math.round(candidate.similarityScore)}%
                        </CardTitle>
                        <CardDescription>
                          {candidate.reason} · detectada em {formatDate(candidate.detectedAt)}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          disabled={Boolean(resolvingDuplicateId)}
                          onClick={() => handleResolveDuplicate(candidate, "ignored")}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          {isResolving ? "Atualizando..." : "Ignorar suspeita"}
                        </Button>
                        <Button
                          className="gradient-primary"
                          disabled={Boolean(resolvingDuplicateId)}
                          onClick={() => handleResolveDuplicate(candidate, "merged")}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {isResolving ? "Atualizando..." : "Resolver duplicidade"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 md:grid-cols-2">
                        <DuplicatePersonPanel label="Cadastro principal" person={candidate.primaryPerson} />
                        <DuplicatePersonPanel label="Cadastro semelhante" person={candidate.duplicatePerson} />
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <Card key={card.label} className="glass">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <card.icon className="h-4 w-4 text-primary" />
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-primary" />
                  Visão geral
                </CardTitle>
                <CardDescription>Base para relatórios e exportações auditadas.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cake className="h-5 w-5 text-primary" />
                  Aniversariantes
                </CardTitle>
                <CardDescription>Usa datas reais cadastradas em pessoas.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  Duplicidades
                </CardTitle>
                <CardDescription>{dashboard.possibleDuplicates} suspeita(s) aberta(s).</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-5 w-5 text-primary" />
                  Campos extras
                </CardTitle>
                <CardDescription>{formOptions.congregations.length} congregação(ões) disponível(is) no formulário.</CardDescription>
              </CardHeader>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5 text-primary" />
                  Atividades
                </CardTitle>
                <CardDescription>{formOptions.activities.length} atividade(s) ativa(s) cadastrada(s).</CardDescription>
              </CardHeader>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Route className="h-5 w-5 text-primary" />
                  Jornadas
                </CardTitle>
                <CardDescription>{formOptions.journeys.length} jornada(s) ativa(s).</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{formData.id ? "Editar pessoa" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>Dados pessoais e pastorais básicos.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome completo *</Label>
              <Input
                value={formData.fullName}
                onChange={(event) => setFormData({ ...formData, fullName: event.target.value })}
                placeholder="Nome e sobrenome"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="email@igreja.com.br"
                />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Data de nascimento</Label>
                <Input
                  type="date"
                  value={formData.birthDate}
                  onChange={(event) => setFormData({ ...formData, birthDate: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Gênero</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => value && setFormData({ ...formData, gender: value as PersonGender })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_informed">Não informado</SelectItem>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Feminino</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Congregação</Label>
                <Select
                  value={formData.congregationId}
                  onValueChange={(value) => value && setFormData({ ...formData, congregationId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem congregação</SelectItem>
                    {formOptions.congregations.map((congregation) => (
                      <SelectItem key={congregation.id} value={congregation.id}>
                        {congregation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => value && setFormData({ ...formData, status: value as PersonStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                    <SelectItem value="visitor">Visitante</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Tipo pastoral</Label>
                <Select
                  value={formData.personType}
                  onValueChange={(value) => value && setFormData({ ...formData, personType: value as PersonType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visitor">Visitante</SelectItem>
                    <SelectItem value="attendee">Frequentador</SelectItem>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="leader">Líder</SelectItem>
                    <SelectItem value="volunteer">Voluntário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={formData.state}
                  onChange={(event) => setFormData({ ...formData, state: event.target.value.toUpperCase() })}
                  placeholder="SP"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Cidade</Label>
                <Input
                  value={formData.city}
                  onChange={(event) => setFormData({ ...formData, city: event.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div className="grid gap-2">
                <Label>Endereço</Label>
                <Input
                  value={formData.address}
                  onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                  placeholder="Rua, número, bairro"
                />
              </div>
            </div>
            <div className="grid gap-3 rounded-lg border border-border/40 p-3 sm:grid-cols-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Batizado</Label>
                <Switch
                  checked={formData.baptized}
                  onCheckedChange={(checked) => setFormData({ ...formData, baptized: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label>E-mail validado</Label>
                <Switch
                  checked={formData.emailValidated}
                  onCheckedChange={(checked) => setFormData({ ...formData, emailValidated: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label>Ativo</Label>
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
              </div>
            </div>
            {canInviteAccess ? (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label>
                      {formData.hasSystemAccess ? "Atualizar acesso ao sistema" : "Convidar para o sistema"}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Cria login com e-mail + senha temporária (admin/pastor).
                    </p>
                  </div>
                  <Switch
                    checked={formData.inviteAccess}
                    onCheckedChange={(checked) => setFormData({ ...formData, inviteAccess: checked })}
                  />
                </div>
                {formData.inviteAccess ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Perfil de acesso</Label>
                      <Select
                        value={formData.accessRole}
                        onValueChange={(value) =>
                          value && setFormData({ ...formData, accessRole: value as PersonAccessRole })
                        }
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
                        value={formData.temporaryPassword}
                        onChange={(event) =>
                          setFormData({ ...formData, temporaryPassword: event.target.value })
                        }
                        placeholder="Mínimo 8 caracteres"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gradient-primary">
              {isSaving ? "Salvando..." : formData.id ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingPerson ? "Excluir pessoa" : "Excluir pessoas selecionadas"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPerson ? (
                <>Tem certeza que deseja remover <strong>{deletingPerson.fullName}</strong>? A ação fica auditada.</>
              ) : (
                <>Tem certeza que deseja remover <strong>{selectedPeople.length} pessoa{selectedPeople.length === 1 ? "" : "s"}</strong>? As ações ficam auditadas.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground"
            >
              {isDeleting ? "Excluindo..." : deletingPerson ? "Excluir" : "Excluir selecionadas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
