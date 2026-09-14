"use client"

import { FormEvent, useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Activity,
  CalendarDays,
  Edit,
  Filter,
  LayoutGrid,
  List,
  MapPin,
  MoreVertical,
  Network,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  UsersRound,
} from "lucide-react"
import { toast } from "sonner"
import { createGroupCategory, deleteGroup, saveGroup } from "./actions"
import { GroupOperationsPanel } from "./group-operations-panel"
import { CellFormFields } from "@/components/cells/cell-form-fields"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CellFeaturesClient } from "../celulas/cell-features-client"
import type { CellFeaturesData } from "@/lib/cells/types"
import type {
  GroupDashboardData,
  GroupCategory,
  GroupFormOptions,
  GroupListFilters,
  GroupListItem,
  GroupMember,
  GroupListResult,
  GroupMeeting,
  GroupType,
  SaveGroupInput,
} from "@/lib/groups/types"

type GroupFormState = {
  id: string | null
  companyId: string | null
  categoryId: string
  congregationId: string
  name: string
  description: string
  type: GroupType
  leaderPersonId: string
  coLeaderPersonId: string
  coordinatorPersonId: string
  meetingDay: string
  meetingTime: string
  meetingLocation: string
  postalCode: string
  addressNumber: string
  addressComplement: string
  neighborhood: string
  city: string
  state: string
  maxCapacity: number
  minAge: number | null
  maxAge: number | null
  acceptsRequests: boolean
  isActive: boolean
  latitude: number | null
  longitude: number | null
  isAddressPublic: boolean
  cellPhotoUrl: string | null
}

type FilterState = {
  search: string
  categoryId: string
  type: string
  status: string
  meetingDay: string
}

export interface GroupsClientProps {
  dashboard: GroupDashboardData
  filters: GroupListFilters
  formOptions: GroupFormOptions
  groupsResult: GroupListResult
  members: GroupMember[]
  meetings: GroupMeeting[]
  cellFeatures?: CellFeaturesData
  initialTab?: string
}

const typeLabels: Record<GroupType, string> = {
  cell: "Célula",
  ministry: "Ministério",
  department: "Departamento",
  class: "Classe",
}

const typeColors: Record<GroupType, string> = {
  cell: "border-primary/20 bg-primary/10 text-primary",
  ministry: "border-success/20 bg-success/10 text-success",
  department: "border-warning/20 bg-warning/10 text-warning",
  class: "border-info/20 bg-info/10 text-info",
}

const emptyForm: GroupFormState = {
  id: null,
  companyId: null,
  categoryId: "none",
  congregationId: "none",
  name: "",
  description: "",
  type: "cell",
  leaderPersonId: "none",
  coLeaderPersonId: "none",
  coordinatorPersonId: "none",
  meetingDay: "",
  meetingTime: "",
  meetingLocation: "",
  postalCode: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  maxCapacity: 0,
  minAge: null,
  maxAge: null,
  acceptsRequests: true,
  isActive: true,
  latitude: null,
  longitude: null,
  isAddressPublic: true,
  cellPhotoUrl: null,
}

function formatDate(value: string) {
  return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

function toFilterChoice(value: boolean | null | undefined) {
  if (value === true) return "active"
  if (value === false) return "inactive"
  return "all"
}

function nullableChoice(value: string) {
  return value === "none" ? null : value
}

function groupToForm(group: GroupListItem): GroupFormState {
  return {
    id: group.id,
    companyId: group.companyId,
    categoryId: group.categoryId ?? "none",
    congregationId: group.congregationId ?? "none",
    name: group.name,
    description: group.description,
    type: group.type,
    leaderPersonId: group.leaderPersonId ?? "none",
    coLeaderPersonId: group.coLeaderPersonId ?? "none",
    coordinatorPersonId: group.coordinatorPersonId ?? "none",
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime?.slice(0, 5) ?? "",
    meetingLocation: group.meetingLocation,
    postalCode: group.postalCode,
    addressNumber: group.addressNumber,
    addressComplement: group.addressComplement,
    neighborhood: group.neighborhood,
    city: group.city,
    state: group.state,
    maxCapacity: group.maxCapacity,
    minAge: group.minAge,
    maxAge: group.maxAge,
    acceptsRequests: group.acceptsRequests,
    isActive: group.isActive,
    latitude: group.latitude ?? null,
    longitude: group.longitude ?? null,
    isAddressPublic: group.isAddressPublic ?? true,
    cellPhotoUrl: group.cellPhotoUrl ?? null,
  }
}

function buildActionInput(form: GroupFormState): SaveGroupInput {
  return {
    id: form.id,
    companyId: form.companyId,
    categoryId: nullableChoice(form.categoryId),
    congregationId: nullableChoice(form.congregationId),
    name: form.name,
    description: form.description,
    type: form.type,
    leaderPersonId: nullableChoice(form.leaderPersonId),
    coLeaderPersonId: nullableChoice(form.coLeaderPersonId),
    coordinatorPersonId: nullableChoice(form.coordinatorPersonId),
    meetingDay: form.meetingDay,
    meetingTime: form.meetingTime || null,
    meetingLocation: form.meetingLocation,
    postalCode: form.postalCode,
    addressNumber: form.addressNumber,
    addressComplement: form.addressComplement,
    neighborhood: form.neighborhood,
    city: form.city,
    state: form.state,
    maxCapacity: form.maxCapacity,
    minAge: form.minAge,
    maxAge: form.maxAge,
    acceptsRequests: form.acceptsRequests,
    isActive: form.isActive,
    latitude: form.latitude,
    longitude: form.longitude,
    isAddressPublic: form.isAddressPublic,
    cellPhotoUrl: form.cellPhotoUrl,
  }
}

function Metric({ title, value, icon: Icon }: { title: string; value: string | number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export function GroupsClient({
  dashboard,
  filters,
  formOptions,
  groupsResult,
  members,
  meetings,
  cellFeatures,
  initialTab,
}: GroupsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [categoryName, setCategoryName] = useState("")
  const [categoryError, setCategoryError] = useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [groupToDelete, setGroupToDelete] = useState<GroupListItem | null>(null)
  const [form, setForm] = useState<GroupFormState>(emptyForm)
  const [createdCategories, setCreatedCategories] = useState<GroupCategory[]>([])
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    categoryId: filters.categoryId ?? "all",
    type: filters.type ?? "all",
    status: toFilterChoice(filters.isActive),
    meetingDay: filters.meetingDay ?? "all",
  })

  const [activeTab, setActiveTab] = useState(initialTab || "celulas")
  const [selectedCellForOps, setSelectedCellForOps] = useState<string>(groupsResult.groups[0]?.id ?? "")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  useEffect(() => {
    try {
      const saved = localStorage.getItem("altar_cells_view_mode")
      if (saved === "grid" || saved === "list") {
        setViewMode(saved)
      }
    } catch {
      // ignore in environments with restricted storage
    }
  }, [])

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      params.set("aba", tab)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }

  function handleViewModeChange(mode: "grid" | "list") {
    setViewMode(mode)
    try {
      localStorage.setItem("altar_cells_view_mode", mode)
    } catch {
      // ignore
    }
  }

  function goToCellParticipants(groupId: string) {
    setSelectedCellForOps(groupId)
    handleTabChange("participantes")
  }

  const categories = useMemo(() => {
    const byId = new Map([...formOptions.categories, ...createdCategories].map((category) => [category.id, category]))
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [createdCategories, formOptions.categories])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const currentParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
    const params = new URLSearchParams()
    const currentAba = currentParams.get("aba") || activeTab
    if (currentAba) params.set("aba", currentAba)
    if (filterState.search.trim()) params.set("search", filterState.search.trim())
    if (filterState.categoryId !== "all") params.set("categoryId", filterState.categoryId)
    params.set("type", "cell")
    if (filterState.status !== "all") params.set("status", filterState.status)
    if (filterState.meetingDay !== "all") params.set("meetingDay", filterState.meetingDay)
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  function goToPage(page: number) {
    const currentParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
    const params = new URLSearchParams()
    const currentAba = currentParams.get("aba") || activeTab
    if (currentAba) params.set("aba", currentAba)
    if (filters.search) params.set("search", filters.search)
    if (filters.categoryId && filters.categoryId !== "all") params.set("categoryId", filters.categoryId)
    if (filters.type && filters.type !== "all") params.set("type", filters.type)
    if (filters.isActive === true) params.set("status", "active")
    if (filters.isActive === false) params.set("status", "inactive")
    if (filters.meetingDay && filters.meetingDay !== "all") params.set("meetingDay", filters.meetingDay)
    params.set("page", String(page))
    router.push(`${pathname}?${params.toString()}`)
  }

  function openCreate() {
    setForm(emptyForm)
    setCategoryName("")
    setCategoryError("")
    setDialogOpen(true)
  }

  function openEdit(group: GroupListItem) {
    setForm(groupToForm(group))
    setDialogOpen(true)
  }

  function openDelete(group: GroupListItem) {
    setGroupToDelete(group)
    setDeleteDialogOpen(true)
  }

  function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveGroup(buildActionInput(form))
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar célula")
        return
      }
      toast.success(form.id ? "Célula atualizada" : "Célula criada")
      setDialogOpen(false)
      router.refresh()
    })
  }

  function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = categoryName.trim()
    if (!name) {
      setCategoryError("Informe nome da categoria")
      return
    }
    startTransition(async () => {
      const result = await createGroupCategory({ companyId: form.companyId, name })
      if (!result.ok || !result.id) {
        setCategoryError(result.error ?? "Não foi possível criar categoria")
        return
      }
      const newCategory = {
        id: result.id,
        companyId: form.companyId ?? "",
        name,
        description: "",
        sortOrder: 0,
        isActive: true,
      }
      setCreatedCategories((current) => [...current, newCategory])
      setForm((current) => ({ ...current, categoryId: result.id ?? "none" }))
      setCategoryName("")
      setCategoryError("")
      setCategoryDialogOpen(false)
      toast.success("Categoria criada")
    })
  }

  function confirmDelete() {
    if (!groupToDelete) return
    startTransition(async () => {
      const result = await deleteGroup({ id: groupToDelete.id, companyId: groupToDelete.companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir célula")
        return
      }
      toast.success("Célula excluída")
      setDeleteDialogOpen(false)
      setGroupToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Células" description="Gestão de células, supervisão, liderança, participantes e encontros.">
        <div className="flex items-center gap-2">
          <Button render={<Link href="/celulas/saude" />} nativeButton={false} variant="outline">
            <Activity className="mr-2 h-4 w-4 text-emerald-500" />
            Saúde das células
          </Button>
          <Button onClick={openCreate} className="gradient-primary">
            <Plus className="mr-2 h-4 w-4" />
            Nova célula
          </Button>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1 bg-muted/60">
          <TabsTrigger value="celulas" className="flex items-center gap-2 py-2.5">
            <Network className="h-4 w-4" />
            <span>Células</span>
          </TabsTrigger>
          <TabsTrigger value="participantes" className="flex items-center gap-2 py-2.5">
            <UsersRound className="h-4 w-4" />
            <span>Participantes</span>
          </TabsTrigger>
          <TabsTrigger value="reunioes" className="flex items-center gap-2 py-2.5">
            <CalendarDays className="h-4 w-4" />
            <span>Reuniões</span>
          </TabsTrigger>
          <TabsTrigger value="gestao" className="flex items-center gap-2 py-2.5">
            <Sparkles className="h-4 w-4" />
            <span>Gestão de Células</span>
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: CÉLULAS */}
        <TabsContent value="celulas" className="space-y-6 mt-0">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric title="Células" value={dashboard.total} icon={Network} />
            <Metric title="Ativos" value={dashboard.active} icon={UserCheck} />
            <Metric title="Inativos" value={dashboard.inactive} icon={Filter} />
            <Metric title="Participantes" value={dashboard.members} icon={UsersRound} />
            <Metric title="Vagas abertas" value={dashboard.openCapacity} icon={CalendarDays} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>Busque por nome, descrição, líder, categoria, tipo e dia da semana.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-6">
                <div className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterState.search}
                    onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
                    className="pl-9 md:pl-9"
                    placeholder="Buscar célula ou líder"
                  />
                </div>
                <Select value={filterState.categoryId} onValueChange={(value) => setFilterState({ ...filterState, categoryId: value ?? "all" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {filterState.categoryId === "all"
                        ? "Todas categorias"
                        : categories.find((category) => category.id === filterState.categoryId)?.name ?? "Todas categorias"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterState.status} onValueChange={(value) => setFilterState({ ...filterState, status: value ?? "all" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{filterState.status === "all" ? "Todos status" : filterState.status === "active" ? "Ativos" : "Inativos"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit">
                  <Filter className="mr-2 h-4 w-4" />
                  Filtrar
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Células cadastradas</CardTitle>
                <CardDescription>{groupsResult.total} células encontradas</CardDescription>
              </div>
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1.5"
                  onClick={() => handleViewModeChange("grid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Grade
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1.5"
                  onClick={() => handleViewModeChange("list")}
                >
                  <List className="h-4 w-4" />
                  Lista
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {groupsResult.groups.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  title="Nenhuma célula encontrada"
                  description="Crie a primeira célula para iniciar o acompanhamento."
                  action={<Button onClick={openCreate}>Criar célula</Button>}
                />
              ) : viewMode === "grid" ? (
                /* GRID / CARDS VIEW */
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {groupsResult.groups.map((group) => {
                    const memberCount = group.memberCount || 0
                    const maxCapacity = group.maxCapacity || 0
                    const occupancyPercent = maxCapacity > 0 ? Math.min(100, Math.round((memberCount / maxCapacity) * 100)) : 0
                    const openSpots = maxCapacity > 0 ? Math.max(0, maxCapacity - memberCount) : null

                    return (
                      <Card key={group.id} className="flex flex-col justify-between overflow-hidden border-border/80 transition-all hover:shadow-md hover:border-primary/40">
                        <CardHeader className="pb-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold text-lg leading-snug">{group.name}</h3>
                                <Badge className={typeColors[group.type]}>{typeLabels[group.type]}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {group.categoryName ?? "Sem categoria"}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {group.isActive ? (
                                <Badge className="border-success/20 bg-success/10 text-success text-xs">Ativo</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Inativo</Badge>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  disabled={isPending}
                                  aria-label={`Ações de ${group.name}`}
                                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => goToCellParticipants(group.id)}>
                                    <UsersRound className="mr-2 h-4 w-4" />
                                    Ver participantes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEdit(group)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => openDelete(group)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {group.description && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">{group.description}</p>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-3 pb-3 text-sm">
                          <div className="rounded-lg bg-muted/40 p-2.5 space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <UserCheck className="h-3.5 w-3.5 text-primary" />
                              <span>Liderança:</span>
                              <span className="font-medium text-foreground">{group.leaderName ?? "Sem líder"}</span>
                            </div>
                            {group.coLeaderName && (
                              <div className="text-xs text-muted-foreground pl-5">
                                Vice: <span className="font-medium text-foreground">{group.coLeaderName}</span>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-3.5 w-3.5 text-primary/80" />
                              <span>
                                {group.meetingDay || "Dia não definido"}
                                {group.meetingTime ? ` às ${group.meetingTime.slice(0, 5)}` : ""}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-primary/80" />
                              <span className="line-clamp-1">{group.meetingLocation || group.city || "Local não informado"}</span>
                            </div>
                          </div>

                          <div className="space-y-1 pt-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Participantes:</span>
                              <span className="font-medium">
                                {memberCount} {maxCapacity > 0 ? `/ ${maxCapacity}` : "membros"}
                                {openSpots !== null && <span className="text-muted-foreground ml-1">({openSpots} vagas)</span>}
                              </span>
                            </div>
                            {maxCapacity > 0 && (
                              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                                <div
                                  className={`h-full transition-all ${
                                    occupancyPercent >= 90 ? "bg-amber-500" : "bg-primary"
                                  }`}
                                  style={{ width: `${occupancyPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                        <CardFooter className="pt-2 border-t bg-muted/20 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => goToCellParticipants(group.id)}
                          >
                            <UsersRound className="mr-1.5 h-3.5 w-3.5" />
                            Participantes
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => openEdit(group)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </CardFooter>
                      </Card>
                    )
                  })}
                </div>
              ) : (
                /* TABLE / LIST VIEW */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Célula</TableHead>
                        <TableHead>Liderança</TableHead>
                        <TableHead>Encontro</TableHead>
                        <TableHead>Participantes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupsResult.groups.map((group) => (
                        <TableRow key={group.id}>
                          <TableCell>
                            <div className="max-w-md">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{group.name}</p>
                                <Badge className={typeColors[group.type]}>{typeLabels[group.type]}</Badge>
                              </div>
                              <p className="line-clamp-1 text-sm text-muted-foreground">{group.categoryName ?? "Sem categoria"} · {group.description || "Sem descrição"}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p>{group.leaderName ?? "Sem líder"}</p>
                            {group.coLeaderName && <p className="text-xs text-muted-foreground">Vice: {group.coLeaderName}</p>}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              <p>{group.meetingDay || "Sem dia"} {group.meetingTime ? `às ${group.meetingTime.slice(0, 5)}` : ""}</p>
                              <p className="flex items-center gap-1 text-muted-foreground">
                                <MapPin className="h-3.5 w-3.5" />
                                {group.meetingLocation || group.city || "-"}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>{group.memberCount}/{group.maxCapacity || "-"}</TableCell>
                          <TableCell>
                            {group.isActive ? <Badge className="border-success/20 bg-success/10 text-success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                disabled={isPending}
                                aria-label={`Ações de ${group.name}`}
                                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => goToCellParticipants(group.id)}>
                                  <UsersRound className="mr-2 h-4 w-4" />
                                  Ver participantes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(group)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => openDelete(group)}>
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
              )}

              {groupsResult.pageCount > 1 && (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button variant="outline" disabled={groupsResult.page <= 1} onClick={() => goToPage(groupsResult.page - 1)}>
                    Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Página {groupsResult.page} de {groupsResult.pageCount}
                  </span>
                  <Button variant="outline" disabled={groupsResult.page >= groupsResult.pageCount} onClick={() => goToPage(groupsResult.page + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: PARTICIPANTES */}
        <TabsContent value="participantes" className="space-y-6 mt-0">
          <GroupOperationsPanel
            formOptions={formOptions}
            groups={groupsResult.groups}
            members={members}
            meetings={meetings}
            viewMode="members"
            selectedGroupId={selectedCellForOps}
            onSelectedGroupChange={setSelectedCellForOps}
          />
        </TabsContent>

        {/* ABA 3: REUNIÕES */}
        <TabsContent value="reunioes" className="space-y-6 mt-0">
          <GroupOperationsPanel
            formOptions={formOptions}
            groups={groupsResult.groups}
            members={members}
            meetings={meetings}
            viewMode="meetings"
            selectedGroupId={selectedCellForOps}
            onSelectedGroupChange={setSelectedCellForOps}
          />

          <Card>
            <CardHeader>
              <CardTitle>Reuniões recentes e futuras da igreja</CardTitle>
              <CardDescription>Agenda consolidada de todas as células.</CardDescription>
            </CardHeader>
            <CardContent>
              {meetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma reunião futura registrada.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {meetings.map((meeting) => (
                    <div key={meeting.id} className="rounded-lg border p-4 bg-card/60 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-base">{meeting.title || meeting.groupName}</p>
                        <Badge variant="outline">{meeting.groupName}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        {formatDate(meeting.startsAt)}
                      </p>
                      {meeting.location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {meeting.location}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 4: GESTÃO DE CÉLULAS */}
        <TabsContent value="gestao" className="space-y-6 mt-0">
          {cellFeatures ? (
            <CellFeaturesClient data={cellFeatures} />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Recursos de gestão não disponíveis neste momento.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <form onSubmit={submitGroup} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar célula" : "Nova célula"}</DialogTitle>
              <DialogDescription>Dados persistidos no banco com auditoria e validação no servidor.</DialogDescription>
            </DialogHeader>

            <CellFormFields
              form={form}
              onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              formOptions={{
                categories,
                congregations: formOptions.congregations,
                people: formOptions.people,
              }}
              leaderMode={false}
              pending={isPending}
              onCreateCategory={() => setCategoryDialogOpen(true)}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button data-testid="group-save-button" type="submit" disabled={isPending} className="gradient-primary">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitCategory} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Criar categoria</DialogTitle>
              <DialogDescription>A categoria ficará disponível para as células desta igreja.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="group-category-name">Nome *</Label>
              <Input id="group-category-name" data-testid="group-category-name-input" value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setCategoryError("") }} autoFocus required />
              {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
              <Button data-testid="group-category-save-button" type="submit" disabled={isPending || !categoryName.trim()} className="gradient-primary">Criar categoria</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir célula?</AlertDialogTitle>
            <AlertDialogDescription>
              A célula será desativada e removida das listas operacionais. Auditoria será registrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete} disabled={isPending}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
