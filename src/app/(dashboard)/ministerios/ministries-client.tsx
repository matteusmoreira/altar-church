"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, Heart, MoreVertical, Plus, Search, Trash2, User, Users } from "lucide-react"
import { toast } from "sonner"
import { deleteMinistry, saveMinistry } from "@/lib/pastoral/actions"
import type { MinistriesListResult, MinistryListItem, PastoralListFilters } from "@/lib/pastoral/types"
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

interface MinistriesClientProps {
  ministriesResult: MinistriesListResult
  filters: PastoralListFilters
  leaderCandidates: { id: string; fullName: string }[]
}

interface MinistryFormState {
  id: string | null
  companyId: string | null
  name: string
  description: string
  contact: string
  leaderPersonId: string
  isActive: boolean
}

interface FilterState {
  search: string
  isActive: string
}

const emptyForm: MinistryFormState = {
  id: null,
  companyId: null,
  name: "",
  description: "",
  contact: "",
  leaderPersonId: "",
  isActive: true,
}

function formatDate(value: string) {
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
}

function toFilterChoice(value: boolean | null | undefined) {
  if (value === true) return "yes"
  if (value === false) return "no"
  return "all"
}

function ministryToForm(ministry: MinistryListItem): MinistryFormState {
  return {
    id: ministry.id,
    companyId: ministry.companyId,
    name: ministry.name,
    description: ministry.description,
    contact: ministry.contact,
    leaderPersonId: ministry.leaderPersonId ?? "",
    isActive: ministry.isActive,
  }
}

export function MinistriesClient({ ministriesResult, filters, leaderCandidates }: MinistriesClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/ministerios"
  const ministries = ministriesResult.items
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingMinistry, setEditingMinistry] = useState<MinistryListItem | null>(null)
  const [deletingMinistry, setDeletingMinistry] = useState<MinistryListItem | null>(null)
  const [formData, setFormData] = useState<MinistryFormState>(emptyForm)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    isActive: toFilterChoice(filters.isActive),
  })

  const activeMinistries = ministries.filter((ministry) => ministry.isActive).length
  const totalMembers = ministries.reduce((sum, ministry) => sum + ministry.memberCount, 0)

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
    setEditingMinistry(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (ministry: MinistryListItem) => {
    setEditingMinistry(ministry)
    setFormData(ministryToForm(ministry))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Informe o nome do ministério")
      return
    }

    setIsSaving(true)
    const result = await saveMinistry({
      id: formData.id,
      companyId: formData.companyId,
      name: formData.name,
      description: formData.description,
      contact: formData.contact,
      leaderPersonId: formData.leaderPersonId || null,
      isActive: formData.isActive,
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar o ministério")
      return
    }

    toast.success(editingMinistry ? "Ministério atualizado com sucesso" : "Ministério cadastrado com sucesso")
    setDialogOpen(false)
    setEditingMinistry(null)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingMinistry) return

    setIsDeleting(true)
    const result = await deleteMinistry({
      id: deletingMinistry.id,
      companyId: deletingMinistry.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir o ministério")
      return
    }

    toast.success("Ministério removido com sucesso")
    setDeleteDialogOpen(false)
    setDeletingMinistry(null)
    router.refresh()
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gestão de Ministérios</h1>
          <p className="text-muted-foreground">Gerencie ministérios com dados persistidos por igreja.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Ministério
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{ministriesResult.total}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Heart className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Ativos nesta página</p>
                <p className="text-2xl font-bold">{activeMinistries}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10">
                <Users className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Participantes vinculados</p>
                <p className="text-2xl font-bold">{totalMembers}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-info/10">
                <User className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, contato ou descrição"
            value={filterState.search}
            onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
            className="pl-9 md:pl-9"
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
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Ativos</SelectItem>
            <SelectItem value="no">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ministries.map((ministry) => (
          <Card key={ministry.id} className="glass overflow-hidden group">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{ministry.name}</CardTitle>
                  <Badge
                    className={
                      ministry.isActive
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                    }
                  >
                    {ministry.isActive ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(ministry)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingMinistry(ministry)
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
                {ministry.description || "Sem descrição cadastrada."}
              </p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5" />
                  <span className="truncate">{ministry.leaderName || "Responsável não informado"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  <span>{ministry.memberCount} participantes</span>
                </div>
                <p className="text-xs">Atualizado em {formatDate(ministry.updatedAt)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {ministries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Heart className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhum ministério encontrado</p>
        </div>
      )}

      {ministriesResult.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {ministriesResult.page} de {ministriesResult.pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={ministriesResult.page <= 1}
              onClick={() => goToPage(ministriesResult.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={ministriesResult.page >= ministriesResult.pageCount}
              onClick={() => goToPage(ministriesResult.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMinistry ? "Editar Ministério" : "Novo Ministério"}</DialogTitle>
            <DialogDescription>
              {editingMinistry ? "Atualize os dados persistidos do ministério." : "Cadastre um ministério real para a igreja."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Nome do ministério"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                placeholder="Descreva objetivo, rotina e público atendido"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Contato ou responsável</Label>
              <Input
                value={formData.contact}
                onChange={(event) => setFormData({ ...formData, contact: event.target.value })}
                placeholder="Nome, e-mail ou telefone"
              />
            </div>
            <div className="grid gap-2">
              <Label>Líder vinculado</Label>
              <Select value={formData.leaderPersonId} onValueChange={(value) => setFormData({ ...formData, leaderPersonId: value ?? "" })}>
                <SelectTrigger><SelectValue placeholder="Selecione uma pessoa" /></SelectTrigger>
                <SelectContent>
                  {leaderCandidates.map((person) => <SelectItem key={person.id} value={person.id}>{person.fullName}</SelectItem>)}
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
                  <SelectItem value="true">Ativo</SelectItem>
                  <SelectItem value="false">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingMinistry ? "Salvar alterações" : "Criar ministério"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ministério</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingMinistry?.name}</strong>? O registro será removido da operação ativa.
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
