"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  CalendarDays,
  Edit,
  Filter,
  MapPin,
  MoreVertical,
  Network,
  Plus,
  Search,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
}

type FilterState = {
  search: string
  categoryId: string
  type: string
  status: string
  meetingDay: string
}

interface GroupsClientProps {
  dashboard: GroupDashboardData
  filters: GroupListFilters
  formOptions: GroupFormOptions
  groupsResult: GroupListResult
  members: GroupMember[]
  meetings: GroupMeeting[]
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

export function GroupsClient({ dashboard, filters, formOptions, groupsResult, members, meetings }: GroupsClientProps) {
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

  const categories = useMemo(() => {
    const byId = new Map([...formOptions.categories, ...createdCategories].map((category) => [category.id, category]))
    return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [createdCategories, formOptions.categories])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    if (filterState.search.trim()) params.set("search", filterState.search.trim())
    if (filterState.categoryId !== "all") params.set("categoryId", filterState.categoryId)
    params.set("type", "cell")
    if (filterState.status !== "all") params.set("status", filterState.status)
    if (filterState.meetingDay !== "all") params.set("meetingDay", filterState.meetingDay)
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname)
  }

  function goToPage(page: number) {
    const params = new URLSearchParams()
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
        <Button onClick={openCreate} className="gradient-primary">
          <Plus className="mr-2 h-4 w-4" />
          Nova célula
        </Button>
      </PageHeader>

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
        <CardHeader>
          <CardTitle>Células cadastradas</CardTitle>
          <CardDescription>{groupsResult.total} células encontradas</CardDescription>
        </CardHeader>
        <CardContent>
          {groupsResult.groups.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Nenhuma célula encontrada"
              description="Crie a primeira célula para iniciar o acompanhamento."
              action={<Button onClick={openCreate}>Criar célula</Button>}
            />
          ) : (
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

      <GroupOperationsPanel
        formOptions={formOptions}
        groups={groupsResult.groups}
        members={members}
        meetings={meetings}
      />

      <Card>
        <CardHeader>
          <CardTitle>Reuniões recentes</CardTitle>
          <CardDescription>Relatórios e agenda de encontros persistidos.</CardDescription>
        </CardHeader>
        <CardContent>
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma reunião futura registrada.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="rounded-lg border p-4">
                  <p className="font-medium">{meeting.title || meeting.groupName}</p>
                  <p className="text-sm text-muted-foreground">{meeting.groupName}</p>
                  <p className="mt-2 text-sm">{formatDate(meeting.startsAt)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
