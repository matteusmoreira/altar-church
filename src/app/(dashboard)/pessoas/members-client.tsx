"use client"

import Link from "next/link"
import { FormEvent, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  AlertTriangle,
  Baby,
  BarChart3,
  Cake,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Filter,
  Kanban,
  List,
  Loader2,
  MessageCircle,
  MoreVertical,
  Plus,
  Route,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth/context"
import { PersonAddressFields } from "@/components/people/address-fields"
import { toCsv } from "@/lib/export/csv"
import {
  createMemberJourney,
  createPersonActivity,
  deletePeople,
  loadBirthdayPeople,
  loadDuplicateCandidates,
  movePersonToKanban,
  resolveDuplicateCandidate,
  savePerson,
} from "./actions"
import type {
  BirthdayPerson,
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
import type { CRMStage } from "@/lib/types"
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
  crmStages: CRMStage[]
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
  postalCode: string
  address: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  baptized: boolean
  emailValidated: boolean
  isActive: boolean
  internalNotes: string
  inviteAccess: boolean
  accessRole: PersonAccessRole
  cellIds: string[]
  temporaryPassword: string
  hasSystemAccess: boolean
  moveToKanban: boolean
  kanbanStageId: string
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

const typeChartColors: Record<string, string> = {
  member: "#6366f1",
  visitor: "#06b6d4",
  attendee: "#3b82f6",
  leader: "#8b5cf6",
  volunteer: "#10b981",
}

const monthNames = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

function personTypeLabel(person: PersonListItem) {
  if (person.cellIds.length > 0) return accessRoleLabels.cell_leader
  return personTypeLabels[person.personType]
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
  postalCode: "",
  address: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  baptized: false,
  emailValidated: false,
  isActive: true,
  internalNotes: "",
  inviteAccess: false,
  accessRole: "member",
  cellIds: [],
  temporaryPassword: "",
  hasSystemAccess: false,
  moveToKanban: false,
  kanbanStageId: "default",
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

function formatPhoneMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
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
    phone: formatPhoneMask(person.phone),
    birthDate: person.birthDate ?? "",
    gender: person.gender ?? "not_informed",
    congregationId: person.congregationId ?? "none",
    status: person.status,
    personType: person.personType,
    postalCode: formatCepMask(person.postalCode),
    address: person.address,
    addressNumber: person.addressNumber,
    addressComplement: person.addressComplement,
    neighborhood: person.neighborhood,
    city: person.city,
    state: person.state,
    baptized: person.baptized,
    emailValidated: person.emailValidated,
    isActive: person.isActive,
    internalNotes: "",
    inviteAccess: false,
    accessRole: person.accessRole ?? "member",
    cellIds: person.cellIds,
    temporaryPassword: "",
    hasSystemAccess: person.hasSystemAccess,
    moveToKanban: false,
    kanbanStageId: "default",
  }
}

function formatCepMask(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function getWhatsAppUrl(phone: string, fullName?: string, customMessage?: string) {
  const digits = phone.replace(/\D/g, "")
  if (!digits || digits.length < 8) return null
  const number = digits.startsWith("55") ? digits : `55${digits}`
  const firstName = fullName ? fullName.split(" ")[0] : ""
  const defaultMsg = firstName
    ? `Olá ${firstName}! A paz do Senhor. Entramos em contato pela equipe da igreja.`
    : `Olá! A paz do Senhor. Entramos em contato pela equipe da igreja.`
  const text = encodeURIComponent(customMessage || defaultMsg)
  return `https://wa.me/${number}?text=${text}`
}

function downloadCsvFile(filename: string, rows: (string | number | boolean | null | undefined)[][]) {
  const csvContent = "\uFEFF" + toCsv(rows)
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  crmStages,
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
  const [duplicates, setDuplicates] = useState(duplicateCandidates)
  const [duplicatesLoaded, setDuplicatesLoaded] = useState(duplicateCandidates.length > 0)
  const [duplicatesLoading, setDuplicatesLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false)
  const [resolvingDuplicateId, setResolvingDuplicateId] = useState<string | null>(null)
  const [deletingPerson, setDeletingPerson] = useState<PersonListItem | null>(null)
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState<PersonFormState>(emptyForm)

  // Birthday state
  const [birthdayMonth, setBirthdayMonth] = useState<number>(new Date().getMonth() + 1)
  const [birthdays, setBirthdays] = useState<BirthdayPerson[]>([])
  const [birthdaysLoading, setBirthdaysLoading] = useState(false)

  // Activities & Journeys state
  const [activitiesList, setActivitiesList] = useState(formOptions.activities)
  const [journeysList, setJourneysList] = useState(formOptions.journeys)
  const [newActivityOpen, setNewActivityOpen] = useState(false)
  const [newActivityForm, setNewActivityForm] = useState<{
    description: string
    category: "pastoral" | "worship" | "ministry" | "small_group" | "volunteer"
  }>({ description: "", category: "pastoral" })
  const [isCreatingActivity, setIsCreatingActivity] = useState(false)

  const [newJourneyOpen, setNewJourneyOpen] = useState(false)
  const [newJourneyForm, setNewJourneyForm] = useState<{ name: string; description: string }>({
    name: "",
    description: "",
  })
  const [isCreatingJourney, setIsCreatingJourney] = useState(false)

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

  const handleQuickFilter = (type: string, kids = "all") => {
    const updated = {
      ...filterState,
      personType: type,
      kidsRole: kids,
    }
    setFilterState(updated)
    updateRoute(updated)
  }

  const fetchBirthdays = async (month: number) => {
    setBirthdaysLoading(true)
    try {
      const list = await loadBirthdayPeople(month)
      setBirthdays(list)
    } catch {
      toast.error("Não foi possível carregar os aniversariantes")
    } finally {
      setBirthdaysLoading(false)
    }
  }

  const handleMonthChange = (monthStr: string | null) => {
    if (!monthStr) return
    const m = Number(monthStr)
    setBirthdayMonth(m)
    void fetchBirthdays(m)
  }

  const handleTabChange = async (value: string) => {
    setActiveTab(value)
    if (value === "duplicidades" && !duplicatesLoaded && !duplicatesLoading) {
      setDuplicatesLoading(true)
      try {
        setDuplicates(await loadDuplicateCandidates())
        setDuplicatesLoaded(true)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível carregar duplicidades")
      } finally {
        setDuplicatesLoading(false)
      }
    }
    if (value === "relatorios" && birthdays.length === 0 && !birthdaysLoading) {
      void fetchBirthdays(birthdayMonth)
    }
  }

  const handleCreateActivity = async () => {
    if (!newActivityForm.description.trim()) {
      toast.error("Informe o nome ou descrição da atividade")
      return
    }
    setIsCreatingActivity(true)
    try {
      const res = await createPersonActivity(newActivityForm)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao cadastrar atividade")
        return
      }
      toast.success("Atividade cadastrada com sucesso!")
      setActivitiesList((current) => [
        ...current,
        {
          id: res.id ?? String(Date.now()),
          description: newActivityForm.description.trim(),
          category: newActivityForm.category,
        },
      ])
      setNewActivityForm({ description: "", category: "pastoral" })
      setNewActivityOpen(false)
    } catch {
      toast.error("Não foi possível salvar a atividade")
    } finally {
      setIsCreatingActivity(false)
    }
  }

  const handleCreateJourney = async () => {
    if (!newJourneyForm.name.trim()) {
      toast.error("Informe o nome da jornada")
      return
    }
    setIsCreatingJourney(true)
    try {
      const res = await createMemberJourney(newJourneyForm)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao cadastrar jornada")
        return
      }
      toast.success("Jornada cadastrada com sucesso!")
      setJourneysList((current) => [
        ...current,
        {
          id: res.id ?? String(Date.now()),
          name: newJourneyForm.name.trim(),
        },
      ])
      setNewJourneyForm({ name: "", description: "" })
      setNewJourneyOpen(false)
    } catch {
      toast.error("Não foi possível salvar a jornada")
    } finally {
      setIsCreatingJourney(false)
    }
  }

  const exportCurrentListCsv = () => {
    const headers = [
      "Nome Completo",
      "Perfil",
      "E-mail",
      "Telefone",
      "Congregação",
      "Nascimento",
      "Status",
      "Batizado",
      "Acesso ao Sistema",
    ]
    const data = (selectedPeople.length > 0 ? selectedPeople : peopleResult.people).map((p) => [
      p.fullName,
      personTypeLabel(p),
      p.email || "",
      p.phone || "",
      p.congregationName || "Sem congregação",
      p.birthDate ? formatDate(p.birthDate) : "",
      statusLabels[p.status],
      p.baptized ? "Sim" : "Não",
      p.hasSystemAccess ? "Com login" : "Sem login",
    ])
    downloadCsvFile("pessoas_altar_church.csv", [headers, ...data])
    toast.success("Exportação CSV concluída com sucesso!")
  }

  const exportBirthdaysCsv = () => {
    const headers = ["Nome", "Dia", "Mês", "Telefone", "Perfil", "Congregação"]
    const data = birthdays.map((b) => [
      b.fullName,
      b.day,
      monthNames[b.month - 1] ?? b.month,
      b.phone || "",
      personTypeLabels[b.personType] || b.personType,
      b.congregationName || "Sem congregação",
    ])
    downloadCsvFile(`aniversariantes_${monthNames[birthdayMonth - 1].toLowerCase()}.csv`, [
      headers,
      ...data,
    ])
    toast.success("Lista de aniversariantes exportada!")
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
    setShowTemporaryPassword(false)
    setDialogOpen(true)
  }

  const openEditDialog = (person: PersonListItem) => {
    setFormData(personToForm(person))
    setShowTemporaryPassword(false)
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

    if (formData.inviteAccess && formData.accessRole === "cell_leader" && formData.cellIds.length === 0) {
      toast.error("Selecione ao menos uma célula para o líder")
      return
    }

    setIsSaving(true)
    try {
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
      postalCode: formData.postalCode,
      address: formData.address,
      addressNumber: formData.addressNumber,
      addressComplement: formData.addressComplement,
      neighborhood: formData.neighborhood,
      city: formData.city,
      state: formData.state,
      baptized: formData.baptized,
      emailValidated: formData.emailValidated,
      isActive: formData.isActive,
      internalNotes: formData.internalNotes,
      inviteAccess: formData.inviteAccess,
      accessRole: formData.inviteAccess ? formData.accessRole : undefined,
      temporaryPassword: formData.inviteAccess ? formData.temporaryPassword : undefined,
      cellIds: formData.inviteAccess && formData.accessRole === "cell_leader" ? formData.cellIds : [],
    })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar a pessoa")
        return
      }

    let kanbanMoved = false
    if (formData.moveToKanban && result.id) {
      const kanbanResult = await movePersonToKanban({
        personId: result.id,
        stageId: formData.kanbanStageId === "default" ? null : formData.kanbanStageId,
      })
      if (!kanbanResult.ok) {
        toast.error(
          kanbanResult.error
            ? `Pessoa salva, mas não foi movida para o Kanban: ${kanbanResult.error}`
            : "Pessoa salva, mas não foi movida para o Kanban",
        )
      } else {
        kanbanMoved = true
      }
    }

    if (formData.inviteAccess) {
      toast.success(
        formData.hasSystemAccess
          ? "Pessoa salva e acesso atualizado. Informe a senha temporária à pessoa."
          : "Pessoa salva e acesso criado. Informe a senha temporária à pessoa.",
      )
    } else {
      toast.success(
        kanbanMoved
          ? "Pessoa salva e movida para o Kanban"
          : formData.id
            ? "Pessoa atualizada com sucesso"
            : "Pessoa cadastrada com sucesso",
      )
    }
    setDialogOpen(false)
    setFormData(emptyForm)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a pessoa")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    const peopleToDelete = deletingPerson ? [deletingPerson] : selectedPeople
    if (peopleToDelete.length === 0) return

    setIsDeleting(true)
    try {
      const result = await deletePeople({
        ids: peopleToDelete.map((person) => person.id),
        companyId: peopleToDelete[0]?.companyId,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir as pessoas selecionadas")
        return
      }
      toast.success(peopleToDelete.length === 1 ? "Pessoa removida com sucesso" : `${peopleToDelete.length} pessoas removidas com sucesso`)
      setDeleteDialogOpen(false)
      setDeletingPerson(null)
      setSelectedPersonIds(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir as pessoas selecionadas")
    } finally {
      setIsDeleting(false)
    }
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
    setDuplicates((current) => current.filter((item) => item.id !== candidate.id))
  }

  const totalCount = dashboard.total
  const activeMembers = dashboard.active
  const visitorsCount = dashboard.visitors
  const pendingDuplicates = dashboard.possibleDuplicates
  const baptizedCount = dashboard.baptized
  const baptizedPct = totalCount > 0 ? Math.round((baptizedCount / totalCount) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pessoas</h1>
          <p className="text-muted-foreground">
            Gestão completa de membros, visitantes, congregações e liderança pastoral.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCurrentListCsv}
            className="w-full sm:w-auto"
            title="Exportar registros filtrados para planilha CSV"
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            render={<Link href="/pessoas/follow-up" />}
            nativeButton={false}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <Activity className="mr-2 h-4 w-4" />
            Follow-up
          </Button>
          <Button
            onClick={openCreateDialog}
            size="sm"
            className="gradient-primary w-full sm:w-auto shadow-sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova pessoa
          </Button>
        </div>
      </div>

      {/* Primary KPI Highlights Banner */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass cursor-pointer transition-all hover:border-primary/40" onClick={() => handleQuickFilter("all")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total de Pessoas
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Cadastros gerais na igreja</p>
          </CardContent>
        </Card>

        <Card className="glass cursor-pointer transition-all hover:border-success/40" onClick={() => handleQuickFilter("member")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Membros Ativos
            </CardTitle>
            <UserCheck className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totalCount > 0 ? `${Math.round((activeMembers / totalCount) * 100)}% da congregação` : "Comunhão ativa"}
            </p>
          </CardContent>
        </Card>

        <Card className="glass cursor-pointer transition-all hover:border-info/40" onClick={() => handleQuickFilter("visitor")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Visitantes
            </CardTitle>
            <UserPlus className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{visitorsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Em acolhimento e integração</p>
          </CardContent>
        </Card>

        <Card
          className={`glass cursor-pointer transition-all ${
            pendingDuplicates > 0
              ? "border-warning/40 bg-warning/5 hover:border-warning"
              : "hover:border-primary/40"
          }`}
          onClick={() => setActiveTab("duplicidades")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Duplicidades
            </CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${pendingDuplicates > 0 ? "text-warning" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{pendingDuplicates}</div>
              {pendingDuplicates > 0 && (
                <Badge variant="outline" className="border-warning/40 text-warning text-xs">
                  Revisar
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {pendingDuplicates > 0 ? "Suspeitas a consolidar" : "Base saneada"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => value && void handleTabChange(value)}>
        <TabsList className="flex h-auto flex-wrap p-1 bg-muted/50 rounded-lg">
          <TabsTrigger value="lista" className="gap-2">
            <List className="h-4 w-4" />
            Lista geral
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-2">
            <Cake className="h-4 w-4" />
            Aniversários & Relatórios
          </TabsTrigger>
          <TabsTrigger value="duplicidades" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Duplicidades
            {pendingDuplicates > 0 && (
              <Badge className="ml-1.5 h-5 px-1.5 text-[10px] bg-warning text-warning-foreground">
                {pendingDuplicates}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Atividades & Parâmetros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
          <Card className="glass">
            <CardHeader className="space-y-3 pb-3">
              {/* Quick Pills for 1-Click Filtering */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-3">
                <span className="text-xs font-semibold uppercase text-muted-foreground mr-1 flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Filtro rápido:
                </span>
                <Button
                  type="button"
                  variant={filterState.personType === "all" && filterState.kidsRole === "all" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("all")}
                >
                  Todos ({totalCount})
                </Button>
                <Button
                  type="button"
                  variant={filterState.personType === "member" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("member")}
                >
                  Membros
                </Button>
                <Button
                  type="button"
                  variant={filterState.personType === "visitor" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("visitor")}
                >
                  Visitantes
                </Button>
                <Button
                  type="button"
                  variant={filterState.personType === "leader" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("leader")}
                >
                  Líderes
                </Button>
                <Button
                  type="button"
                  variant={filterState.personType === "volunteer" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("volunteer")}
                >
                  Voluntários
                </Button>
                <Button
                  type="button"
                  variant={filterState.kidsRole !== "all" ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs rounded-full"
                  onClick={() => handleQuickFilter("all", "any")}
                >
                  <Baby className="mr-1 h-3 w-3" />
                  Kids
                </Button>
              </div>

              <form className="grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={handleFilterSubmit}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, e-mail ou telefone..."
                    value={filterState.search}
                    onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={filterState.status}
                    onValueChange={(value) => value && setFilterState({ ...filterState, status: value })}
                  >
                    <SelectTrigger className="w-full sm:w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
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
                      <TableHead>Contato & WhatsApp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {peopleResult.people.map((person) => {
                      const whatsappUrl = getWhatsAppUrl(person.phone, person.fullName)
                      return (
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
                              <Avatar className="h-9 w-9 border border-border/40">
                                <AvatarFallback className="gradient-primary text-xs font-semibold text-white">
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
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {person.hasSystemAccess ? (
                                    <Badge variant="outline" className="border-success/30 text-success text-[10px] py-0">
                                      Com acesso
                                    </Badge>
                                  ) : null}
                                  {person.kidsRoles.map((role) => (
                                    <Badge key={role} variant="outline" className="border-info/30 text-info text-[10px] py-0">
                                      <Baby className="mr-0.5 h-2.5 w-2.5" />
                                      {role === "child" ? "Kids" : "Resp. Kids"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <Badge variant="secondary" className="font-normal text-xs">
                              {personTypeLabel(person)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {person.congregationName ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(person.birthDate)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{person.phone || "-"}</span>
                              {whatsappUrl && (
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success/10 text-success hover:bg-success hover:text-white transition-colors shrink-0"
                                  title={`Enviar WhatsApp para ${person.fullName}`}
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[person.status]}>
                              {statusLabels[person.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
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
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {peopleResult.people.map((person) => {
                  const whatsappUrl = getWhatsAppUrl(person.phone, person.fullName)
                  return (
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
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge className={statusColors[person.status]}>
                              {statusLabels[person.status]}
                            </Badge>
                            <Badge variant="outline">{personTypeLabel(person)}</Badge>
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
                        <div className="flex items-center gap-1">
                          {whatsappUrl && (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-success hover:bg-success/10 rounded-md"
                              title="WhatsApp"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </a>
                          )}
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
                    </div>
                  )
                })}
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

            {duplicatesLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando duplicidades...
              </div>
            ) : duplicates.length === 0 ? (
              <Card className="glass">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 text-success/70" />
                  <p className="mt-4 text-sm text-muted-foreground">Nenhuma possível duplicidade aberta.</p>
                </CardContent>
              </Card>
            ) : (
              duplicates.map((candidate) => {
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

        {/* TAB 2: DASHBOARD GRÁFICO */}
        <TabsContent value="dashboard" className="mt-4 space-y-6">
          {/* Top Pastoral Overview Row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" /> Novos Membros (6m)
                </CardDescription>
                <CardTitle className="text-2xl font-bold">
                  {(dashboard.monthlyRegistrations ?? []).reduce((acc, m) => acc + m.count, 0)}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">Cadastrados no último semestre</p>
              </CardHeader>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Cake className="h-3.5 w-3.5 text-info" /> Taxa de Batismo
                </CardDescription>
                <CardTitle className="text-2xl font-bold">{baptizedPct}%</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {dashboard.baptized} de {dashboard.total} pessoas batizadas
                </p>
              </CardHeader>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5 text-warning" /> Comunhão e Atividade
                </CardDescription>
                <CardTitle className="text-2xl font-bold">
                  {totalCount > 0 ? `${Math.round((activeMembers / totalCount) * 100)}%` : "0%"}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {activeMembers} cadastros ativos no momento
                </p>
              </CardHeader>
            </Card>

            <Card className="glass">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <UserCheck className="h-3.5 w-3.5 text-success" /> Acesso ao Portal
                </CardDescription>
                <CardTitle className="text-2xl font-bold">{dashboard.emailValidated}</CardTitle>
                <p className="text-[11px] text-muted-foreground">E-mails verificados na igreja</p>
              </CardHeader>
            </Card>
          </div>

          {/* Charts Row 1: Monthly Evolution & Profile Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Monthly Trend AreaChart */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Evolução de Novos Cadastros (Últimos 6 meses)
                </CardTitle>
                <CardDescription>Volume mensal de pessoas ingressando na base da igreja</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dashboard.monthlyRegistrations ?? []}>
                      <defs>
                        <linearGradient id="colorMonthly" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 25%)" />
                      <XAxis dataKey="label" stroke="oklch(0.6 0.02 260)" fontSize={12} />
                      <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.18 0.02 260)",
                          border: "1px solid oklch(1 0 0 / 10%)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Novos cadastros"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorMonthly)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Profile Distribution Donut Chart */}
            <Card className="glass">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  Composição por Perfil Pastoral
                </CardTitle>
                <CardDescription>Distribuição entre membros, visitantes, líderes e voluntários</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.typeDistribution ?? []}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                      >
                        {(dashboard.typeDistribution ?? []).map((entry) => (
                          <Cell key={entry.type} fill={typeChartColors[entry.type] ?? "#6366f1"} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.18 0.02 260)",
                          border: "1px solid oklch(1 0 0 / 10%)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2: Age Distribution & Demographics */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Age Distribution Bar Chart */}
            <Card className="glass lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Faixas Etárias na Igreja
                </CardTitle>
                <CardDescription>Segmentação etária baseada nas datas de nascimento registradas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashboard.ageDistribution ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260 / 25%)" />
                      <XAxis dataKey="group" stroke="oklch(0.6 0.02 260)" fontSize={11} />
                      <YAxis stroke="oklch(0.6 0.02 260)" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.18 0.02 260)",
                          border: "1px solid oklch(1 0 0 / 10%)",
                          borderRadius: "8px",
                          color: "#fff",
                        }}
                      />
                      <Bar dataKey="count" name="Pessoas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Demographics & Gender Ratios */}
            <Card className="glass space-y-4 p-6">
              <div>
                <CardTitle className="text-base">Demografia & Gênero</CardTitle>
                <CardDescription className="text-xs">Divisão de gênero cadastrada</CardDescription>
              </div>

              <div className="space-y-4 pt-2">
                {(dashboard.genderDistribution ?? []).map((item) => {
                  const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0
                  return (
                    <div key={item.gender} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{item.label}</span>
                        <span className="text-muted-foreground">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              item.gender === "female"
                                ? "#ec4899"
                                : item.gender === "male"
                                  ? "#3b82f6"
                                  : "#94a3b8",
                          }}
                        />
                      </div>
                    </div>
                  )
                })}

                <div className="border-t border-border/40 pt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Batismo em Águas</p>
                  <div className="flex items-center justify-between text-sm">
                    <span>Batizados</span>
                    <span className="font-bold text-primary">{dashboard.baptized}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${baptizedPct}%` }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-right">{baptizedPct}% do total</p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* TAB 3: ANIVERSÁRIOS & RELATÓRIOS */}
        <TabsContent value="relatorios" className="mt-4 space-y-6">
          {/* Aniversariantes do Mês Section */}
          <Card className="glass">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Cake className="h-5 w-5 text-primary" />
                  Aniversariantes do Mês
                </CardTitle>
                <CardDescription>
                  Parabenize os membros e visitantes diretamente pelo WhatsApp.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={String(birthdayMonth)}
                  onValueChange={handleMonthChange}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthNames.map((name, idx) => (
                      <SelectItem key={name} value={String(idx + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportBirthdaysCsv}
                  disabled={birthdays.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar lista
                </Button>
              </div>
            </CardHeader>

            <CardContent>
              {birthdaysLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando aniversariantes...
                </div>
              ) : birthdays.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Cake className="h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">Nenhum aniversariante encontrado neste mês</p>
                  <p className="text-xs text-muted-foreground">
                    Verifique se os cadastros possuem data de nascimento preenchida.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {birthdays.map((person) => {
                    const whatsappMsg = `Parabéns ${person.fullName.split(" ")[0]}! 🎉 Toda a família da igreja celebra sua vida hoje. Que o Senhor te abençoe ricamente com paz, saúde e sabedoria!`
                    const whatsappUrl = getWhatsAppUrl(person.phone, person.fullName, whatsappMsg)

                    return (
                      <div
                        key={person.id}
                        className="flex items-start justify-between rounded-lg border border-border/40 p-3 bg-muted/20"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                            <span className="text-xs uppercase leading-none">Dia</span>
                            <span className="text-sm font-extrabold">{person.day}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/pessoas/${person.id}`}
                              className="truncate text-sm font-medium block hover:text-primary transition-colors"
                            >
                              {person.fullName}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">
                              {person.congregationName || personTypeLabels[person.personType]}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{person.phone || "Sem fone"}</p>
                          </div>
                        </div>

                        {whatsappUrl && (
                          <a
                            href={whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success hover:text-white transition-colors shrink-0 ml-2"
                            title="Parabenizar no WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Felicitar
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Saneamento Cadastral e Saúde dos Dados */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Qualidade e Saneamento Cadastral</h2>
              <p className="text-sm text-muted-foreground">
                Métricas de completude dos cadastros para secretaria e liderança pastoral.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Sem Telefone</CardDescription>
                  <CardTitle className="text-2xl font-bold text-destructive">
                    {dashboard.dataQuality?.missingPhone ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Pessoas sem contato cadastrado</p>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Sem E-mail</CardDescription>
                  <CardTitle className="text-2xl font-bold text-warning">
                    {dashboard.dataQuality?.missingEmail ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Sem possibilidade de login no portal</p>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Sem Data de Nascimento</CardDescription>
                  <CardTitle className="text-2xl font-bold text-muted-foreground">
                    {dashboard.dataQuality?.missingBirthDate ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Ficam de fora dos aniversários</p>
                </CardContent>
              </Card>

              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs">Perfis Completos</CardDescription>
                  <CardTitle className="text-2xl font-bold text-success">
                    {dashboard.dataQuality?.completeProfiles ?? 0}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Com telefone, e-mail e nascimento</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* TAB 5: PARÂMETROS & ATIVIDADES */}
        <TabsContent value="config" className="mt-4 space-y-6">
          {/* Pastoral Activities Management */}
          <Card className="glass">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5 text-primary" />
                  Atividades e Vínculos Pastorais
                </CardTitle>
                <CardDescription>
                  Atividades que podem ser atribuídas ao histórico e ficha de membros (ex.: Louvor, Diaconia, Coral).
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setNewActivityOpen(true)} className="gradient-primary">
                <Plus className="mr-2 h-4 w-4" /> Nova atividade
              </Button>
            </CardHeader>
            <CardContent>
              {activitiesList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma atividade cadastrada ainda.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activitiesList.map((act) => (
                    <div
                      key={act.id}
                      className="flex items-center justify-between rounded-lg border border-border/40 p-3 bg-muted/20"
                    >
                      <div>
                        <p className="text-sm font-medium">{act.description}</p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">{act.category}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Ativa
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Member Journeys Management */}
          <Card className="glass">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Route className="h-5 w-5 text-primary" />
                  Jornadas de Integração
                </CardTitle>
                <CardDescription>
                  Trilhas de passos espirituais e discipulado (ex.: Batismo, Novos Membros, Encontro).
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setNewJourneyOpen(true)} variant="outline">
                <Plus className="mr-2 h-4 w-4" /> Nova jornada
              </Button>
            </CardHeader>
            <CardContent>
              {journeysList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma jornada cadastrada ainda.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {journeysList.map((j) => (
                    <div
                      key={j.id}
                      className="flex items-center justify-between rounded-lg border border-border/40 p-3 bg-muted/20"
                    >
                      <div className="flex items-center gap-2.5">
                        <Route className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium">{j.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        Configurada
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Governance & System Links */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="glass hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Gatilhos de Follow-up
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Automações para novos visitantes, aniversariantes e ausências.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button render={<Link href="/configuracoes/follow-up" />} nativeButton={false} variant="outline" size="sm" className="w-full text-xs">
                  Gerenciar gatilhos <ExternalLink className="ml-1.5 h-3 w-3" />
                </Button>
              </CardContent>
            </Card>

            <Card className="glass hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Kanban className="h-4 w-4 text-primary" />
                    Congregações & Sedes
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Gestão de campi, filiais e responsáveis territoriais.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button render={<Link href="/congregacoes" />} nativeButton={false} variant="outline" size="sm" className="w-full text-xs">
                  Gerenciar congregações <ExternalLink className="ml-1.5 h-3 w-3" />
                </Button>
              </CardContent>
            </Card>

            <Card className="glass hover:border-primary/40 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    Perfis & Permissões
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription className="text-xs">
                  Acessos de líderes, pastores e equipe ministerial ao SaaS.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button render={<Link href="/configuracoes" />} nativeButton={false} variant="outline" size="sm" className="w-full text-xs">
                  Configurações gerais <ExternalLink className="ml-1.5 h-3 w-3" />
                </Button>
              </CardContent>
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
                  type="tel"
                  inputMode="tel"
                  maxLength={15}
                  value={formData.phone}
                  onChange={(event) =>
                    setFormData({ ...formData, phone: formatPhoneMask(event.target.value) })
                  }
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  onValueChange={(value) => {
                    if (!value) return
                    const personType = value as PersonType
                    setFormData({
                      ...formData,
                      personType,
                      accessRole:
                        personType === "visitor" || personType === "attendee"
                          ? "member"
                          : formData.accessRole,
                    })
                  }}
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
            </div>
            <PersonAddressFields
              value={formData}
              onChange={(address) => setFormData({ ...formData, ...address })}
              disabled={isSaving}
            />
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
            {crmStages.length > 0 ? (
              <div className="space-y-3 rounded-lg border border-border/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="flex items-center gap-2">
                      <Kanban className="h-4 w-4 text-primary" />
                      Mover para Kanban
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Cria (ou move) o card desta pessoa no funil do CRM.
                    </p>
                  </div>
                  <Switch
                    checked={formData.moveToKanban}
                    onCheckedChange={(checked) => setFormData({ ...formData, moveToKanban: checked })}
                  />
                </div>
                {formData.moveToKanban ? (
                  <div className="grid gap-2">
                    <Label>Coluna do Kanban</Label>
                    <Select
                      value={formData.kanbanStageId}
                      onValueChange={(value) => value && setFormData({ ...formData, kanbanStageId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Coluna padrão</SelectItem>
                        {crmStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}
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
                        disabled={formData.personType === "visitor" || formData.personType === "attendee"}
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
                      {formData.personType === "visitor" || formData.personType === "attendee" ? (
                        <p className="text-xs text-muted-foreground">
                          Visitante e frequentador usam Portal do Membro.
                        </p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label>Senha temporária</Label>
                      <div className="relative">
                        <Input
                          type={showTemporaryPassword ? "text" : "password"}
                          autoComplete="new-password"
                          className="pr-10"
                          value={formData.temporaryPassword}
                          onChange={(event) =>
                            setFormData({ ...formData, temporaryPassword: event.target.value })
                          }
                          placeholder="Mínimo 8 caracteres"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={showTemporaryPassword ? "Ocultar senha" : "Mostrar senha"}
                          className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
                          onClick={() => setShowTemporaryPassword((current) => !current)}
                        >
                          {showTemporaryPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {formData.accessRole === "cell_leader" ? (
                      <div className="space-y-2 rounded-lg border border-primary/20 bg-background/60 p-3 sm:col-span-2">
                        <Label>Células do líder *</Label>
                        <p className="text-xs text-muted-foreground">Selecione uma ou mais células que esta pessoa poderá gerenciar.</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {formOptions.cells.map((cell) => (
                            <label key={cell.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                              <input
                                type="checkbox"
                                checked={formData.cellIds.includes(cell.id)}
                                onChange={(event) => setFormData({
                                  ...formData,
                                  cellIds: event.target.checked
                                    ? [...new Set([...formData.cellIds, cell.id])]
                                    : formData.cellIds.filter((id) => id !== cell.id),
                                })}
                              />
                              {cell.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
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

      {/* New Pastoral Activity Dialog */}
      <Dialog open={newActivityOpen} onOpenChange={setNewActivityOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Atividade Pastoral</DialogTitle>
            <DialogDescription>
              Cadastre um ministério, área de atuação ou atividade da igreja.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <Label>Nome da Atividade / Ministério *</Label>
              <Input
                placeholder="Ex.: Louvor, Diaconia, Mídia, Recepção"
                value={newActivityForm.description}
                onChange={(e) =>
                  setNewActivityForm({ ...newActivityForm, description: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Categoria</Label>
              <Select
                value={newActivityForm.category}
                onValueChange={(val) =>
                  val && setNewActivityForm({
                    ...newActivityForm,
                    category: val as "pastoral" | "worship" | "ministry" | "small_group" | "volunteer",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pastoral">Pastoral</SelectItem>
                  <SelectItem value="worship">Louvor & Adoração</SelectItem>
                  <SelectItem value="ministry">Ministério Geral</SelectItem>
                  <SelectItem value="small_group">Pequeno Grupo / Célula</SelectItem>
                  <SelectItem value="volunteer">Voluntariado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewActivityOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateActivity}
              disabled={isCreatingActivity}
              className="gradient-primary"
            >
              {isCreatingActivity ? "Cadastrando..." : "Cadastrar Atividade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Member Journey Dialog */}
      <Dialog open={newJourneyOpen} onOpenChange={setNewJourneyOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Jornada de Integração</DialogTitle>
            <DialogDescription>
              Crie uma trilha de passos espirituais ou discipulado da igreja.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="grid gap-2">
              <Label>Nome da Jornada *</Label>
              <Input
                placeholder="Ex.: Trilha de Integração, Discipulado I, Batismo"
                value={newJourneyForm.name}
                onChange={(e) =>
                  setNewJourneyForm({ ...newJourneyForm, name: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição / Objetivo</Label>
              <Input
                placeholder="Ex.: Para quem aceitou Jesus recentemente"
                value={newJourneyForm.description}
                onChange={(e) =>
                  setNewJourneyForm({ ...newJourneyForm, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewJourneyOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateJourney}
              disabled={isCreatingJourney}
              className="gradient-primary"
            >
              {isCreatingJourney ? "Cadastrando..." : "Cadastrar Jornada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
