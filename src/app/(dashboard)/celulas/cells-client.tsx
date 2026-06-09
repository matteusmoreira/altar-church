"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Clock, Edit, Home, MapPin, MoreVertical, Plus, Search, Trash2, UsersRound } from "lucide-react"
import { toast } from "sonner"
import { deleteGroup, saveGroup } from "@/lib/groups/actions"
import type { GroupFormOptions, GroupListFilters, GroupListItem, GroupListResult } from "@/lib/groups/types"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

interface CellsClientProps {
  groupsResult: GroupListResult
  options: GroupFormOptions
  filters: GroupListFilters
}

interface CellFormState {
  id: string | null
  companyId: string | null
  categoryId: string | null
  congregationId: string | null
  name: string
  description: string
  leaderPersonId: string | null
  coLeaderPersonId: string | null
  meetingDay: string
  meetingTime: string
  meetingLocation: string
  neighborhood: string
  city: string
  maxCapacity: number
  acceptsRequests: boolean
  isActive: boolean
}

interface FilterState {
  search: string
  isActive: string
}

const emptyForm: CellFormState = {
  id: null,
  companyId: null,
  categoryId: null,
  congregationId: null,
  name: "",
  description: "",
  leaderPersonId: null,
  coLeaderPersonId: null,
  meetingDay: "",
  meetingTime: "",
  meetingLocation: "",
  neighborhood: "",
  city: "",
  maxCapacity: 0,
  acceptsRequests: true,
  isActive: true,
}

function toFilterChoice(value: boolean | null | undefined) {
  if (value === true) return "yes"
  if (value === false) return "no"
  return "all"
}

function toSelectId(value: string | null | undefined) {
  return value ?? "__none"
}

function fromSelectId(value: string | null) {
  return !value || value === "__none" ? null : value
}

function groupToForm(group: GroupListItem): CellFormState {
  return {
    id: group.id,
    companyId: group.companyId,
    categoryId: group.categoryId,
    congregationId: group.congregationId,
    name: group.name,
    description: group.description,
    leaderPersonId: group.leaderPersonId,
    coLeaderPersonId: group.coLeaderPersonId,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime ?? "",
    meetingLocation: group.meetingLocation,
    neighborhood: group.neighborhood,
    city: group.city,
    maxCapacity: group.maxCapacity,
    acceptsRequests: group.acceptsRequests,
    isActive: group.isActive,
  }
}

export function CellsClient({ groupsResult, options, filters }: CellsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/celulas"
  const cells = groupsResult.groups
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingCell, setEditingCell] = useState<GroupListItem | null>(null)
  const [deletingCell, setDeletingCell] = useState<GroupListItem | null>(null)
  const [formData, setFormData] = useState<CellFormState>(emptyForm)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    isActive: toFilterChoice(filters.isActive),
  })

  const activeCells = cells.filter((cell) => cell.isActive).length
  const totalMembers = cells.reduce((sum, cell) => sum + cell.memberCount, 0)
  const totalCapacity = cells.reduce((sum, cell) => sum + cell.maxCapacity, 0)

  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim())
    if (nextFilters.isActive !== "all") params.set("isActive", nextFilters.isActive)
    if (page > 1) params.set("page", String(page))

    const query = params.toString()
    router.push(query ? `${routePath}?${query}` : routePath)
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState)
  }

  const openCreateDialog = () => {
    setEditingCell(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (cell: GroupListItem) => {
    setEditingCell(cell)
    setFormData(groupToForm(cell))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Informe o nome da célula")
      return
    }

    setIsSaving(true)
    const result = await saveGroup({
      id: formData.id,
      companyId: formData.companyId,
      categoryId: formData.categoryId,
      congregationId: formData.congregationId,
      name: formData.name,
      description: formData.description,
      type: "cell",
      leaderPersonId: formData.leaderPersonId,
      coLeaderPersonId: formData.coLeaderPersonId,
      meetingDay: formData.meetingDay,
      meetingTime: formData.meetingTime,
      meetingLocation: formData.meetingLocation,
      neighborhood: formData.neighborhood,
      city: formData.city,
      maxCapacity: formData.maxCapacity,
      acceptsRequests: formData.acceptsRequests,
      isActive: formData.isActive,
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a célula")
      return
    }

    toast.success(editingCell ? "Célula atualizada com sucesso" : "Célula cadastrada com sucesso")
    setDialogOpen(false)
    setEditingCell(null)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingCell) return

    setIsDeleting(true)
    const result = await deleteGroup({
      id: deletingCell.id,
      companyId: deletingCell.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir a célula")
      return
    }

    toast.success("Célula removida com sucesso")
    setDeleteDialogOpen(false)
    setDeletingCell(null)
    router.refresh()
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Células</h1>
          <p className="text-muted-foreground">Visão operacional de grupos do tipo célula.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova Célula
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{groupsResult.total}</p>
              </div>
              <Home className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ativas nesta página</p>
                <p className="text-2xl font-bold">{activeCells}</p>
              </div>
              <UsersRound className="h-6 w-6 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Participantes / capacidade</p>
                <p className="text-2xl font-bold">
                  {totalMembers}/{totalCapacity}
                </p>
              </div>
              <Clock className="h-6 w-6 text-info" />
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, líder ou local"
            value={filterState.search}
            onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
            className="pl-9"
          />
        </div>
        <Select
          value={filterState.isActive}
          onValueChange={(value) => setFilterState({ ...filterState, isActive: value ?? "all" })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="yes">Ativas</SelectItem>
            <SelectItem value="no">Inativas</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {cells.map((cell) => (
          <Card key={cell.id} className="glass">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{cell.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{cell.leaderName ?? "Sem líder definido"}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(cell)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingCell(cell)
                        setDeleteDialogOpen(true)
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {cell.description || "Sem descrição cadastrada."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge className={cell.isActive ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border/40"}>
                  {cell.isActive ? "Ativa" : "Inativa"}
                </Badge>
                {cell.acceptsRequests && <Badge variant="outline">Aceita solicitações</Badge>}
                <Badge variant="secondary">{cell.memberCount} participantes</Badge>
              </div>
              <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {[cell.meetingDay, cell.meetingTime].filter(Boolean).join(" · ") || "Sem horário"}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {[cell.meetingLocation, cell.neighborhood, cell.city].filter(Boolean).join(" · ") || "Sem local"}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {cells.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Home className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma célula encontrada</p>
        </div>
      )}

      {groupsResult.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {groupsResult.page} de {groupsResult.pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={groupsResult.page <= 1} onClick={() => goToPage(groupsResult.page - 1)}>
              Anterior
            </Button>
            <Button variant="outline" disabled={groupsResult.page >= groupsResult.pageCount} onClick={() => goToPage(groupsResult.page + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingCell ? "Editar Célula" : "Nova Célula"}</DialogTitle>
            <DialogDescription>
              {editingCell ? "Atualize o grupo do tipo célula." : "Crie uma célula persistida em grupos."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Líder</Label>
                <Select
                  value={toSelectId(formData.leaderPersonId)}
                  onValueChange={(value) => setFormData({ ...formData, leaderPersonId: fromSelectId(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem líder</SelectItem>
                    {options.people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Líder auxiliar</Label>
                <Select
                  value={toSelectId(formData.coLeaderPersonId)}
                  onValueChange={(value) => setFormData({ ...formData, coLeaderPersonId: fromSelectId(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem líder auxiliar</SelectItem>
                    {options.people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Dia</Label>
                <Input value={formData.meetingDay} onChange={(event) => setFormData({ ...formData, meetingDay: event.target.value })} placeholder="Quarta-feira" />
              </div>
              <div className="grid gap-2">
                <Label>Horário</Label>
                <Input value={formData.meetingTime} onChange={(event) => setFormData({ ...formData, meetingTime: event.target.value })} placeholder="19:30" />
              </div>
              <div className="grid gap-2">
                <Label>Capacidade</Label>
                <Input type="number" min={0} value={formData.maxCapacity} onChange={(event) => setFormData({ ...formData, maxCapacity: Number(event.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Local</Label>
                <Input value={formData.meetingLocation} onChange={(event) => setFormData({ ...formData, meetingLocation: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Bairro</Label>
                <Input value={formData.neighborhood} onChange={(event) => setFormData({ ...formData, neighborhood: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Cidade</Label>
                <Input value={formData.city} onChange={(event) => setFormData({ ...formData, city: event.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Aceita solicitações?</Label>
                <Select
                  value={formData.acceptsRequests ? "true" : "false"}
                  onValueChange={(value) => setFormData({ ...formData, acceptsRequests: value === "true" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.isActive ? "true" : "false"}
                  onValueChange={(value) => setFormData({ ...formData, isActive: value === "true" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ativa</SelectItem>
                    <SelectItem value="false">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingCell ? "Salvar alterações" : "Criar célula"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir célula</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCell?.name}</strong>? O grupo será removido da operação ativa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground">
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
