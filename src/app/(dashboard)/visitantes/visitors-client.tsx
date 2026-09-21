"use client"

import { FormEvent, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Calendar,
  Check,
  Copy,
  Download,
  Edit,
  ExternalLink,
  Heart,
  LayoutGrid,
  List,
  MessageCircle,
  MoreVertical,
  Network,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { assignVisitorToCell, convertVisitorToMember, deletePerson, savePerson } from "@/lib/people/actions"
import { EmptyState, MetricCard, MetricGrid, PageHeader, ViewToggle } from "@/components/shared"
import type {
  PeopleListFilters,
  PeopleListResult,
  PersonFormOptions,
  PersonListItem,
  VisitorMetrics,
} from "@/lib/people/types"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type VisitorStage = "new" | "contacted" | "following" | "converted" | "inactive"
type VisitorSource = "event" | "service" | "cell" | "online" | "referral" | "walk-in"

interface VisitorsClientProps {
  visitorsResult: PeopleListResult
  filters: PeopleListFilters
  formOptions: PersonFormOptions
  metrics: VisitorMetrics
}

interface VisitorFormState {
  id: string | null
  companyId: string | null
  congregationId: string | null
  cellId: string | null
  name: string
  email: string
  phone: string
  source: VisitorSource
  stage: VisitorStage
  birthDate: string
  gender: PersonListItem["gender"]
  address: string
  city: string
  state: string
  country: string
  baptized: boolean
  emailValidated: boolean
  internalNotes: string
}

interface FilterState {
  search: string
  stage: string
  source: string
  cellId: string
}

const statusColors: Record<VisitorStage, string> = {
  new: "bg-info/10 text-info border-info/20",
  contacted: "bg-warning/10 text-warning border-warning/20",
  following: "bg-primary/10 text-primary border-primary/20",
  converted: "bg-success/10 text-success border-success/20",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
}

const statusLabels: Record<VisitorStage, string> = {
  new: "Novo",
  contacted: "Contactado",
  following: "Acompanhando",
  converted: "Convertido",
  inactive: "Inativo",
}

const sourceLabels: Record<VisitorSource, string> = {
  service: "Culto",
  event: "Evento",
  cell: "Célula",
  online: "Online",
  referral: "Indicação",
  "walk-in": "Espontâneo",
}

const stageValues: VisitorStage[] = ["new", "contacted", "following", "converted", "inactive"]
const sourceValues: VisitorSource[] = ["service", "event", "cell", "online", "referral", "walk-in"]

const emptyForm: VisitorFormState = {
  id: null,
  companyId: null,
  congregationId: null,
  cellId: null,
  name: "",
  email: "",
  phone: "",
  source: "service",
  stage: "new",
  birthDate: "",
  gender: null,
  address: "",
  city: "",
  state: "",
  country: "Brasil",
  baptized: false,
  emailValidated: false,
  internalNotes: "",
}

const whatsappTemplates = [
  {
    id: "welcome",
    label: "Boas-vindas ao Culto",
    getMessage: (name: string) =>
      `Olá, ${name || "amigo(a)"}! Que alegria imensa receber você na nossa igreja! Esperamos de coração que tenha se sentido acolhido(a). Se precisar de alguma coisa ou de uma palavra amiga, estamos à sua disposição! Deus abençoe muito você e sua família.`,
  },
  {
    id: "cell",
    label: "Convite para Célula",
    getMessage: (name: string) =>
      `Olá, ${name || "amigo(a)"}! A paz do Senhor! Gostaríamos muito de convidar você para participar de uma das nossas células nesta semana. É um momento de comunhão, amizade e palavra de Deus em família. Posso te passar o endereço da célula mais próxima de você?`,
  },
  {
    id: "prayer",
    label: "Acompanhamento & Oração",
    getMessage: (name: string) =>
      `Olá, ${name || "amigo(a)"}! Passando para saber como você está e se tem algum pedido de oração para esta semana. Nossa equipe pastoral e de intercessão terá a alegria de orar por você!`,
  },
  {
    id: "custom",
    label: "Mensagem Livre",
    getMessage: (name: string) => `Olá, ${name || "amigo(a)"}! `,
  },
]

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
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

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function normalizeStage(person: PersonListItem): VisitorStage {
  if (!person.isActive || person.status === "inactive") return "inactive"
  if (stageValues.includes(person.journeyStatus as VisitorStage)) {
    return person.journeyStatus as VisitorStage
  }
  return "new"
}

function normalizeSource(value: string | null): VisitorSource {
  if (sourceValues.includes(value as VisitorSource)) return value as VisitorSource
  return "service"
}

function visitorToForm(visitor: PersonListItem): VisitorFormState {
  return {
    id: visitor.id,
    companyId: visitor.companyId,
    congregationId: visitor.congregationId,
    cellId: visitor.cellIds?.[0] ?? null,
    name: visitor.fullName,
    email: visitor.email ?? "",
    phone: formatPhoneMask(visitor.phone),
    source: normalizeSource(visitor.accessProfile),
    stage: normalizeStage(visitor),
    birthDate: visitor.birthDate ?? "",
    gender: visitor.gender,
    address: visitor.address,
    city: visitor.city,
    state: visitor.state,
    country: visitor.country,
    baptized: visitor.baptized,
    emailValidated: visitor.emailValidated,
    internalNotes: visitor.internalNotes ?? "",
  }
}

function formatDate(value: string) {
  try {
    return format(parseISO(value), "dd MMM yyyy", { locale: ptBR })
  } catch {
    return value
  }
}

type ViewMode = "grid" | "list"

const VISITORS_VIEW_MODE_KEY = "altar_visitors_view_mode"
const VISITORS_VIEW_MODE_EVENT = "altar-visitors-view-mode-change"
let currentVisitorsViewMode: ViewMode = "grid"

function subscribeToVisitorsViewMode(callback: () => void) {
  window.addEventListener(VISITORS_VIEW_MODE_EVENT, callback)
  return () => window.removeEventListener(VISITORS_VIEW_MODE_EVENT, callback)
}

function getVisitorsViewMode(): ViewMode {
  try {
    const storedViewMode = window.localStorage.getItem(VISITORS_VIEW_MODE_KEY)
    if (storedViewMode === "list" || storedViewMode === "grid") currentVisitorsViewMode = storedViewMode
  } catch { }
  return currentVisitorsViewMode
}

function getServerVisitorsViewMode(): ViewMode {
  return "grid"
}

export function VisitorsClient({
  visitorsResult,
  filters,
  formOptions,
  metrics,
}: VisitorsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/visitantes"
  const visitors = visitorsResult.people

  // Visualização Grade / Lista
  const viewMode = useSyncExternalStore(
    subscribeToVisitorsViewMode,
    getVisitorsViewMode,
    getServerVisitorsViewMode
  )

  const handleViewModeChange = (mode: "grid" | "list") => {
    currentVisitorsViewMode = mode
    try {
      localStorage.setItem(VISITORS_VIEW_MODE_KEY, mode)
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(VISITORS_VIEW_MODE_EVENT))
  }

  // Filtros
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    stage: filters.journeyStatus ?? "all",
    source: filters.accessProfile ?? "all",
    cellId: (filters.cellId as string) ?? "all",
  })

  // Diálogos de CRUD
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<PersonListItem | null>(null)
  const [deletingVisitor, setDeletingVisitor] = useState<PersonListItem | null>(null)
  const [formData, setFormData] = useState<VisitorFormState>(emptyForm)

  // Diálogo de WhatsApp
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [whatsappVisitor, setWhatsappVisitor] = useState<PersonListItem | null>(null)
  const [whatsappPhone, setWhatsappPhone] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState("welcome")
  const [whatsappMessage, setWhatsappMessage] = useState("")

  // Diálogo de Conectar Célula
  const [cellDialogOpen, setCellDialogOpen] = useState(false)
  const [cellVisitor, setCellVisitor] = useState<PersonListItem | null>(null)
  const [selectedCellId, setSelectedCellId] = useState<string>("none")
  const [isSavingCell, setIsSavingCell] = useState(false)

  // Diálogo de Converter em Membro
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [convertingVisitor, setConvertingVisitor] = useState<PersonListItem | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  // Helper para nome da célula
  const getCellName = (cellIds?: string[] | null) => {
    if (!cellIds || cellIds.length === 0) return null
    const found = formOptions.cells.find((c) => cellIds.includes(c.id))
    return found?.name || null
  }

  // Atualização de rota
  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim())
    if (nextFilters.stage !== "all") params.set("stage", nextFilters.stage)
    if (nextFilters.source !== "all") params.set("source", nextFilters.source)
    if (nextFilters.cellId !== "all") params.set("cellId", nextFilters.cellId)
    if (page > 1) params.set("page", String(page))

    const query = params.toString()
    router.push(query ? `${routePath}?${query}` : routePath)
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState, 1)
  }

  const clearFilters = () => {
    const emptyFilters: FilterState = { search: "", stage: "all", source: "all", cellId: "all" }
    setFilterState(emptyFilters)
    router.push(routePath)
  }

  const hasActiveFilters =
    Boolean(filterState.search.trim()) ||
    filterState.stage !== "all" ||
    filterState.source !== "all" ||
    filterState.cellId !== "all"

  // Ações de WhatsApp
  const openWhatsAppDialog = (visitor: PersonListItem) => {
    setWhatsappVisitor(visitor)
    setWhatsappPhone(formatPhoneMask(visitor.phone || ""))
    const firstName = visitor.fullName.trim().split(" ")[0] || ""
    setSelectedTemplate("welcome")
    setWhatsappMessage(whatsappTemplates[0].getMessage(firstName))
    setWhatsappOpen(true)
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    const tmpl = whatsappTemplates.find((t) => t.id === templateId)
    if (tmpl && whatsappVisitor) {
      const firstName = whatsappVisitor.fullName.trim().split(" ")[0] || ""
      setWhatsappMessage(tmpl.getMessage(firstName))
    }
  }

  const handleSendWhatsApp = async () => {
    const rawPhone = whatsappPhone.trim() || whatsappVisitor?.phone || ""
    const digits = rawPhone.replace(/\D/g, "")
    if (digits.length < 8) {
      toast.error("Informe um número de telefone/WhatsApp válido para envio.")
      return
    }

    // Se o telefone foi adicionado ou alterado, salva no cadastro do visitante
    if (whatsappVisitor && (!whatsappVisitor.phone || whatsappVisitor.phone !== rawPhone)) {
      const { firstName, lastName } = splitName(whatsappVisitor.fullName)
      savePerson({
        id: whatsappVisitor.id,
        companyId: whatsappVisitor.companyId,
        congregationId: whatsappVisitor.congregationId,
        firstName,
        lastName,
        fullName: whatsappVisitor.fullName,
        phone: rawPhone,
        personType: "visitor",
      }).catch(() => {})
    }

    const fullPhone = digits.startsWith("55") ? digits : `55${digits}`
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(whatsappMessage)}`
    window.open(url, "_blank")
    setWhatsappOpen(false)
  }

  // Ações de Conectar a Célula
  const openCellDialog = (visitor: PersonListItem) => {
    setCellVisitor(visitor)
    const currentCell = visitor.cellIds?.[0] ?? "none"
    setSelectedCellId(currentCell)
    setCellDialogOpen(true)
  }

  const handleSaveCellAssignment = async () => {
    if (!cellVisitor) return
    setIsSavingCell(true)
    const cellId = selectedCellId === "none" ? null : selectedCellId
    const res = await assignVisitorToCell({ personId: cellVisitor.id, cellId })
    setIsSavingCell(false)

    if (!res.ok) {
      toast.error(res.error || "Não foi possível vincular à célula.")
      return
    }

    toast.success(
      cellId ? "Visitante vinculado à célula com sucesso!" : "Vínculo de célula removido com sucesso."
    )
    setCellDialogOpen(false)
    setCellVisitor(null)
  }

  // Ações de Converter em Membro
  const openConvertDialog = (visitor: PersonListItem) => {
    setConvertingVisitor(visitor)
    setConvertDialogOpen(true)
  }

  const handleConvertToMember = async () => {
    if (!convertingVisitor) return
    setIsConverting(true)
    const res = await convertVisitorToMember(convertingVisitor.id)
    setIsConverting(false)

    if (!res.ok) {
      toast.error(res.error || "Não foi possível converter em membro.")
      return
    }

    const memberId = convertingVisitor.id
    toast.success(`${convertingVisitor.fullName} agora é um membro ativo!`, {
      action: {
        label: "Ver membro",
        onClick: () => router.push(`/pessoas/${memberId}`),
      },
    })
    setConvertDialogOpen(false)
    setConvertingVisitor(null)
  }

  // Exportar CSV
  const handleExportCsv = () => {
    if (visitors.length === 0) {
      toast.error("Nenhum visitante na lista atual para exportar.")
      return
    }

    const rows = [
      ["Nome Completo", "Telefone", "E-mail", "Status", "Origem", "Célula", "Data Cadastro"],
      ...visitors.map((v) => {
        const stage = normalizeStage(v)
        const source = normalizeSource(v.accessProfile)
        const cell = getCellName(v.cellIds) || "Sem célula"
        return [
          v.fullName,
          v.phone || "",
          v.email || "",
          statusLabels[stage] || stage,
          sourceLabels[source] || source,
          cell,
          formatDate(v.createdAt),
        ]
      }),
    ]

    const csvContent =
      "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `visitantes-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("Lista de visitantes exportada com sucesso!")
  }

  // Copiar telefone
  const copyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone)
    toast.success("Telefone copiado para a área de transferência!")
  }

  // Modal de Criar / Editar
  const openCreateDialog = () => {
    setEditingVisitor(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (visitor: PersonListItem) => {
    setEditingVisitor(visitor)
    setFormData(visitorToForm(visitor))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const { firstName, lastName } = splitName(formData.name)
    if (!firstName) {
      toast.error("Informe o nome do visitante.")
      return
    }

    setIsSaving(true)
    const result = await savePerson({
      id: formData.id,
      companyId: formData.companyId,
      congregationId: formData.congregationId,
      cellIds: formData.cellId ? [formData.cellId] : [],
      firstName,
      lastName,
      fullName: formData.name,
      email: formData.email,
      phone: formData.phone,
      birthDate: formData.birthDate,
      gender: formData.gender,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      country: formData.country,
      accessProfile: formData.source,
      status: formData.stage === "inactive" ? "inactive" : "visitor",
      personType: "visitor",
      journeyStatus: formData.stage,
      baptized: formData.baptized,
      emailValidated: formData.emailValidated,
      internalNotes: formData.internalNotes,
      isActive: formData.stage !== "inactive",
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar o visitante.")
      return
    }

    toast.success(editingVisitor ? "Visitante atualizado com sucesso!" : "Visitante cadastrado com sucesso!")
    setDialogOpen(false)
    setEditingVisitor(null)
    setFormData(emptyForm)
  }

  const handleDelete = async () => {
    if (!deletingVisitor) return

    setIsDeleting(true)
    const result = await deletePerson({
      id: deletingVisitor.id,
      companyId: deletingVisitor.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir o visitante.")
      return
    }

    toast.success("Visitante removido com sucesso!")
    setDeleteDialogOpen(false)
    setDeletingVisitor(null)
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Gestão de Visitantes"
        description="Acompanhe, acolha e integre novos visitantes em células e na comunidade."
        actions={
          <>
            <Button variant="outline" onClick={handleExportCsv} className="gap-2 shadow-sm">
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
            <Button variant="brand" onClick={openCreateDialog} className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Novo Visitante
            </Button>
          </>
        }
      />

      {/* Global Stat Cards */}
      <MetricGrid columns={4}>
        <MetricCard
          title="Total de Visitantes"
          value={String(metrics.total)}
          icon={Users}
          tone="primary"
        />
        <MetricCard
          title="Novos (Aguardando)"
          value={String(metrics.newCount)}
          icon={UserPlus}
          tone="info"
        />
        <MetricCard
          title="Em Acompanhamento"
          value={String(metrics.followingCount)}
          icon={Heart}
          tone="primary"
        />
        <MetricCard
          title="Convertidos em Membro"
          value={String(metrics.convertedCount)}
          icon={UserCheck}
          tone="success"
        />
      </MetricGrid>

      {/* Filter & View Switcher Bar */}
      <Card className="glass">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <form onSubmit={handleFilterSubmit} className="flex flex-1 flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, e-mail ou telefone..."
                  value={filterState.search}
                  onChange={(e) => setFilterState({ ...filterState, search: e.target.value })}
                  className="pl-9"
                />
              </div>

              {/* Status / Stage Filter */}
              <Select
                value={filterState.stage}
                onValueChange={(val) => setFilterState({ ...filterState, stage: val ?? "all" })}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  {stageValues.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {statusLabels[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Source Filter */}
              <Select
                value={filterState.source}
                onValueChange={(val) => setFilterState({ ...filterState, source: val ?? "all" })}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  {sourceValues.map((src) => (
                    <SelectItem key={src} value={src}>
                      {sourceLabels[src]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Cell Filter */}
              <Select
                value={filterState.cellId}
                onValueChange={(val) => setFilterState({ ...filterState, cellId: val ?? "all" })}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Célula" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as células</SelectItem>
                  <SelectItem value="none">Sem célula vinculada</SelectItem>
                  {formOptions.cells.map((cell) => (
                    <SelectItem key={cell.id} value={cell.id}>
                      {cell.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button type="submit" variant="secondary" className="shadow-sm">
                Filtrar
              </Button>

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Limpar
                </Button>
              )}
            </form>

            {/* View Mode Toggle: Grade vs Lista */}
            <ViewToggle
              value={viewMode}
              onChange={handleViewModeChange}
              ariaLabel="Modo de visualização"
              showLabel
              className="self-end lg:self-auto"
              options={[
                { value: "grid", label: "Grade", icon: LayoutGrid },
                { value: "list", label: "Lista", icon: List },
              ]}
            />
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {/* Empty State */}
          {visitors.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum visitante encontrado"
              description={
                hasActiveFilters
                  ? "Tente ajustar ou limpar os filtros para encontrar os visitantes."
                  : "Cadastre o primeiro visitante para iniciar o fluxo de recepção e discipulado."
              }
              action={
                hasActiveFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Limpar filtros
                  </Button>
                ) : (
                  <Button variant="brand" onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar visitante
                  </Button>
                )
              }
            />
          ) : viewMode === "grid" ? (
            /* ============================================================ */
            /* MODO GRADE (CARDS MODERNOS)                                 */
            /* ============================================================ */
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visitors.map((visitor) => {
                const stage = normalizeStage(visitor)
                const source = normalizeSource(visitor.accessProfile)
                const cellName = getCellName(visitor.cellIds)

                return (
                  <Card
                    key={visitor.id}
                    className="group relative flex flex-col justify-between overflow-hidden border-border/60 bg-card/60 backdrop-blur-sm transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <div>
                      {/* Card Header: Avatar, Nome, Badges e Menu */}
                      <div className="p-4 pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-11 w-11 shrink-0 ring-2 ring-background">
                              <AvatarFallback className="text-xs font-semibold gradient-primary text-white">
                                {initials(visitor.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <Link
                                href={`/pessoas/${visitor.id}`}
                                className="truncate font-semibold text-foreground hover:underline hover:text-primary transition-colors block text-base"
                              >
                                {visitor.fullName}
                              </Link>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <Badge className={`text-[10px] px-1.5 py-0 h-5 border ${statusColors[stage]}`}>
                                  {statusLabels[stage]}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                                  {sourceLabels[source]}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          {/* Menu 3 Pontinhos */}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0"
                              aria-label="Ações do visitante"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => router.push(`/pessoas/${visitor.id}`)}>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Ver cadastro completo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(visitor)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar dados
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeletingVisitor(visitor)
                                  setDeleteDialogOpen(true)
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir visitante
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Card Content: Contatos, Célula e Data */}
                      <div className="px-4 pb-3 space-y-2.5 text-xs">
                        {/* Telefone */}
                        <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 text-primary" />
                            <span className="font-mono text-foreground">{visitor.phone || "Sem telefone"}</span>
                          </div>
                          {visitor.phone && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              title="Copiar telefone"
                              onClick={() => copyPhone(visitor.phone)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        {/* Célula Vinculada */}
                        <div className="flex items-center gap-2 px-1 text-muted-foreground">
                          <UsersRound className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">
                            {cellName ? (
                              <span className="font-medium text-foreground">{cellName}</span>
                            ) : (
                              <span className="italic text-muted-foreground/80">Sem célula vinculada</span>
                            )}
                          </span>
                        </div>

                        {/* Data da Visita / Cadastro */}
                        <div className="flex items-center gap-2 px-1 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>Cadastrado em {formatDate(visitor.createdAt)}</span>
                        </div>

                        {/* Observações internas (se houver) */}
                        {visitor.internalNotes && (
                          <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2 text-[11px] text-muted-foreground line-clamp-2">
                            <span className="font-medium text-foreground">Obs: </span>
                            {visitor.internalNotes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer: Ações Rápidas */}
                    <div className="border-t border-border/40 bg-muted/20 p-3 pt-2.5 flex flex-wrap items-center gap-2">
                      {/* WhatsApp Button */}
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs shadow-sm"
                        onClick={() => openWhatsAppDialog(visitor)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>

                      {/* Conectar Célula Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 px-2.5"
                        onClick={() => openCellDialog(visitor)}
                        title="Vincular a uma célula"
                      >
                        <Network className="h-3.5 w-3.5" />
                        Célula
                      </Button>

                      {/* Tornar Membro Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1 px-2.5 border-primary/30 text-primary hover:bg-primary/5"
                        onClick={() => openConvertDialog(visitor)}
                        title="Promover para membro da igreja"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Membro
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* ============================================================ */
            /* MODO LISTA (TABELA / LINHAS REFINADAS)                      */
            /* ============================================================ */
            <div className="space-y-2.5">
              {visitors.map((visitor) => {
                const stage = normalizeStage(visitor)
                const source = normalizeSource(visitor.accessProfile)
                const cellName = getCellName(visitor.cellIds)

                return (
                  <div
                    key={visitor.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/40 bg-card/40 p-3.5 transition-all hover:bg-muted/30 lg:flex-row lg:items-center lg:justify-between"
                  >
                    {/* Pessoa Info: Avatar, Nome, E-mail */}
                    <div className="flex min-w-0 items-center gap-3 lg:w-1/3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="text-xs gradient-primary text-white font-semibold">
                          {initials(visitor.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link
                          href={`/pessoas/${visitor.id}`}
                          className="truncate font-semibold text-foreground hover:underline hover:text-primary transition-colors block text-sm"
                        >
                          {visitor.fullName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {visitor.email || "Sem e-mail informado"}
                        </p>
                      </div>
                    </div>

                    {/* Contato & Célula */}
                    <div className="flex flex-wrap items-center gap-4 text-xs lg:w-1/3">
                      <div className="flex items-center gap-1.5 font-mono text-foreground">
                        <Phone className="h-3.5 w-3.5 text-primary" />
                        <span>{visitor.phone || "Sem telefone"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UsersRound className="h-3.5 w-3.5 text-primary" />
                        <span>{cellName || "Sem célula"}</span>
                      </div>
                    </div>

                    {/* Status, Origem & Ações Rápidas */}
                    <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end lg:w-1/3">
                      <div className="flex items-center gap-1.5">
                        <Badge className={`text-[10px] px-1.5 py-0 h-5 border ${statusColors[stage]}`}>
                          {statusLabels[stage]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                          {sourceLabels[source]}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 px-2 text-xs"
                          onClick={() => openWhatsAppDialog(visitor)}
                          title="Enviar mensagem no WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 px-2"
                          onClick={() => openCellDialog(visitor)}
                          title="Vincular à célula"
                        >
                          <Network className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Célula</span>
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1 px-2 border-primary/30 text-primary hover:bg-primary/5"
                          onClick={() => openConvertDialog(visitor)}
                          title="Tornar membro da igreja"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Membro</span>
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground shrink-0"
                            aria-label="Mais opções"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/pessoas/${visitor.id}`)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Ficha completa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(visitor)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setDeletingVisitor(visitor)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-destructive focus:text-destructive"
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
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {visitorsResult.total > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-muted-foreground px-1">
          <p>
            Exibindo {visitors.length} de {visitorsResult.total} visitantes (Página {visitorsResult.page} de{" "}
            {visitorsResult.pageCount})
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={visitorsResult.page <= 1}
              onClick={() => goToPage(visitorsResult.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={visitorsResult.page >= visitorsResult.pageCount}
              onClick={() => goToPage(visitorsResult.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: MENSAGEM WHATSAPP COM TEMPLATES                      */}
      {/* ============================================================ */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="glass-strong sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              Contato por WhatsApp
            </DialogTitle>
            <DialogDescription>
              Envie uma mensagem de acolhimento para{" "}
              <strong>{whatsappVisitor?.fullName}</strong> ({whatsappVisitor?.phone || "Sem telefone"}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Escolha do Template */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Modelo de Mensagem</Label>
              <div className="grid grid-cols-2 gap-2">
                {whatsappTemplates.map((tmpl) => (
                  <Button
                    key={tmpl.id}
                    type="button"
                    variant={selectedTemplate === tmpl.id ? "secondary" : "outline"}
                    size="sm"
                    className="h-auto py-2 px-3 text-xs text-left justify-start border-border/60"
                    onClick={() => handleTemplateChange(tmpl.id)}
                  >
                    <div className="truncate font-medium">{tmpl.label}</div>
                  </Button>
                ))}
              </div>
            </div>

            {/* Campo de Telefone WhatsApp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Número do WhatsApp</Label>
                <span className="text-[11px] text-muted-foreground">Com DDD</span>
              </div>
              <Input
                type="tel"
                inputMode="tel"
                maxLength={15}
                placeholder="(11) 99999-9999"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(formatPhoneMask(e.target.value))}
                className="font-mono text-xs"
              />
            </div>

            {/* Editor de Texto da Mensagem */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Texto da Mensagem</Label>
                <span className="text-[11px] text-muted-foreground">Você pode editar antes de enviar</span>
              </div>
              <Textarea
                rows={5}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Escreva a mensagem de boas-vindas..."
                className="text-xs leading-relaxed"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setWhatsappOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendWhatsApp}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              <Send className="h-4 w-4" />
              Abrir no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL: CONECTAR A CÉLULA                                     */}
      {/* ============================================================ */}
      <Dialog open={cellDialogOpen} onOpenChange={setCellDialogOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Network className="h-5 w-5 text-primary" />
              Conectar Visitante à Célula
            </DialogTitle>
            <DialogDescription>
              Vincule <strong>{cellVisitor?.fullName}</strong> a uma célula da igreja para integração e acompanhamento do líder.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Selecione a Célula</Label>
              <Select value={selectedCellId} onValueChange={(val) => setSelectedCellId(val ?? "none")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha uma célula" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma célula (desvincular)</SelectItem>
                  {formOptions.cells.map((cell) => (
                    <SelectItem key={cell.id} value={cell.id}>
                      {cell.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setCellDialogOpen(false)} disabled={isSavingCell}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCellAssignment} variant="brand" disabled={isSavingCell}>
              {isSavingCell ? "Salvando..." : "Salvar vínculo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL: CONVERTER EM MEMBRO                                   */}
      {/* ============================================================ */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="glass-strong sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <UserCheck className="h-5 w-5 text-success" />
              Tornar Membro da Igreja
            </DialogTitle>
            <DialogDescription>
              Confirma a promoção de <strong>{convertingVisitor?.fullName}</strong> para membro ativo da igreja?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg bg-success/10 border border-success/20 p-3.5 text-xs text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">O que acontece agora:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>O tipo de cadastro mudará de <strong>Visitante</strong> para <strong>Membro</strong>.</li>
              <li>O status da jornada será marcado como <strong>Convertido</strong>.</li>
              <li>Todo o histórico de visitas, notas e vínculos de célula será preservado.</li>
              <li>A pessoa poderá ser escalada em ministérios e cadastrada no portal de membros.</li>
            </ul>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)} disabled={isConverting}>
              Cancelar
            </Button>
            <Button
              onClick={handleConvertToMember}
              className="bg-success text-white hover:bg-success/90 gap-1.5"
              disabled={isConverting}
            >
              <Check className="h-4 w-4" />
              {isConverting ? "Promovendo..." : "Confirmar e Tornar Membro"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* MODAL: NOVO / EDITAR VISITANTE                               */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingVisitor ? "Editar Visitante" : "Novo Visitante"}</DialogTitle>
            <DialogDescription>
              {editingVisitor
                ? "Atualize as informações e o acompanhamento deste visitante."
                : "Cadastre um visitante no núcleo real de pessoas da igreja."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Nome Completo */}
            <div className="grid gap-2">
              <Label>Nome completo *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex.: João da Silva"
              />
            </div>

            {/* Email & Telefone */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="grid gap-2">
                <Label>Telefone / WhatsApp</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  maxLength={15}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: formatPhoneMask(e.target.value) })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            {/* Origem & Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Origem da Visita</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) =>
                    setFormData({ ...formData, source: normalizeSource(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceValues.map((source) => (
                      <SelectItem key={source} value={source}>
                        {sourceLabels[source]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Status de Acompanhamento</Label>
                <Select
                  value={formData.stage}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      stage: stageValues.includes(value as VisitorStage)
                        ? (value as VisitorStage)
                        : "new",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stageValues.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {statusLabels[stage]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Congregação & Célula */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Congregação</Label>
                <Select
                  value={formData.congregationId ?? "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, congregationId: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a congregação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sede / Padrão</SelectItem>
                    {formOptions.congregations.map((congregation) => (
                      <SelectItem key={congregation.id} value={congregation.id}>
                        {congregation.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Célula Inicial</Label>
                <Select
                  value={formData.cellId ?? "none"}
                  onValueChange={(value) =>
                    setFormData({ ...formData, cellId: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a célula" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem célula</SelectItem>
                    {formOptions.cells.map((cell) => (
                      <SelectItem key={cell.id} value={cell.id}>
                        {cell.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Observações Internas */}
            <div className="grid gap-2">
              <Label>Observações internas</Label>
              <Textarea
                rows={3}
                value={formData.internalNotes}
                onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                placeholder="Anotações sobre necessidades de oração, quem convidou, etc."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} variant="brand" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingVisitor ? "Salvar alterações" : "Cadastrar visitante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/* DIÁLOGO DE EXCLUSÃO                                         */}
      {/* ============================================================ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir visitante</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingVisitor?.fullName}</strong>? O cadastro será
              removido da operação ativa de visitantes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
