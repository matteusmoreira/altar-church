"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { deleteCongregation, saveCongregation } from "./actions"
import type {
  CongregationListFilters,
  CongregationListItem,
  CongregationsListResult,
} from "@/lib/congregations/types"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface CongregationsClientProps {
  congregationsResult: CongregationsListResult
  filters: CongregationListFilters
}

interface CongregationFormState {
  id: string | null
  companyId: string | null
  name: string
  responsible: string
  address: string
  isActive: boolean
}

interface FilterState {
  search: string
  isActive: string
}

const emptyForm: CongregationFormState = {
  id: null,
  companyId: null,
  name: "",
  responsible: "",
  address: "",
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

function congregationToForm(congregation: CongregationListItem): CongregationFormState {
  return {
    id: congregation.id,
    companyId: congregation.companyId,
    name: congregation.name,
    responsible: congregation.responsible,
    address: congregation.address,
    isActive: congregation.isActive,
  }
}

export function CongregationsClient({
  congregationsResult,
  filters,
}: CongregationsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingCongregation, setEditingCongregation] = useState<CongregationListItem | null>(null)
  const [deletingCongregation, setDeletingCongregation] = useState<CongregationListItem | null>(null)
  const [formData, setFormData] = useState<CongregationFormState>(emptyForm)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    isActive: toFilterChoice(filters.isActive),
  })

  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim())
    if (nextFilters.isActive !== "all") params.set("isActive", nextFilters.isActive)
    if (page > 1) params.set("page", String(page))

    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState)
  }

  const openCreateDialog = () => {
    setEditingCongregation(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (congregation: CongregationListItem) => {
    setEditingCongregation(congregation)
    setFormData(congregationToForm(congregation))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Informe o nome da congregação")
      return
    }

    setIsSaving(true)
    const result = await saveCongregation({
      id: formData.id,
      companyId: formData.companyId,
      name: formData.name,
      responsible: formData.responsible,
      address: formData.address,
      isActive: formData.isActive,
    })
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a congregação")
      return
    }

    toast.success(editingCongregation ? "Congregação atualizada com sucesso" : "Congregação cadastrada com sucesso")
    setDialogOpen(false)
    setEditingCongregation(null)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingCongregation) return

    setIsDeleting(true)
    const result = await deleteCongregation({
      id: deletingCongregation.id,
      companyId: deletingCongregation.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir a congregação")
      return
    }

    toast.success("Congregação removida com sucesso")
    setDeleteDialogOpen(false)
    setDeletingCongregation(null)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Congregações</h1>
          <p className="text-muted-foreground">Gerencie as congregações da igreja.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova congregação
        </Button>
      </div>

      <Card className="glass">
        <CardHeader>
          <form className="grid gap-3 lg:grid-cols-[1fr_auto]" onSubmit={handleFilterSubmit}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, responsável ou endereço"
                value={filterState.search}
                onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select
                value={filterState.isActive}
                onValueChange={(value) => value && setFilterState({ ...filterState, isActive: value })}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="yes">Ativas</SelectItem>
                  <SelectItem value="no">Inativas</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" variant="outline">
                Filtrar
              </Button>
            </div>
          </form>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última alteração</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {congregationsResult.congregations.map((congregation) => (
                  <TableRow key={congregation.id}>
                    <TableCell className="font-medium">{congregation.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{congregation.address || "-"}</TableCell>
                    <TableCell className="text-sm">{congregation.responsible || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          congregation.isActive
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }
                      >
                        {congregation.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(congregation.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              aria-label={`Ações de ${congregation.name}`}
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            />
                          }
                        >
                          <MoreVertical className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(congregation)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setDeletingCongregation(congregation)
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
            {congregationsResult.congregations.map((congregation) => (
              <div key={congregation.id} className="rounded-lg border border-border/30 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{congregation.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{congregation.responsible || "Sem responsável"}</p>
                    <p className="truncate text-xs text-muted-foreground">{congregation.address || "Sem endereço"}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        className={
                          congregation.isActive
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-destructive/10 text-destructive border-destructive/20"
                        }
                      >
                        {congregation.isActive ? "Ativa" : "Inativa"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(congregation.updatedAt)}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label={`Ações de ${congregation.name}`}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                        />
                      }
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(congregation)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => {
                          setDeletingCongregation(congregation)
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

          {congregationsResult.congregations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">Nenhuma congregação encontrada</p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {congregationsResult.total} registro{congregationsResult.total === 1 ? "" : "s"} encontrado
              {congregationsResult.total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={congregationsResult.page <= 1}
                onClick={() => updateRoute(filterState, congregationsResult.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={congregationsResult.page >= congregationsResult.pageCount}
                onClick={() => updateRoute(filterState, congregationsResult.page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCongregation ? "Editar congregação" : "Nova congregação"}</DialogTitle>
            <DialogDescription>
              {editingCongregation ? "Atualize os dados da congregação." : "Cadastre uma congregação da igreja."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Nome da congregação"
              />
            </div>
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Input
                value={formData.responsible}
                onChange={(event) => setFormData({ ...formData, responsible: event.target.value })}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="grid gap-2">
              <Label>Endereço</Label>
              <Input
                value={formData.address}
                onChange={(event) => setFormData({ ...formData, address: event.target.value })}
                placeholder="Endereço completo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formData.isActive ? "true" : "false"}
                onValueChange={(value) => value && setFormData({ ...formData, isActive: value === "true" })}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gradient-primary">
              {isSaving ? "Salvando..." : editingCongregation ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir congregação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deletingCongregation?.name}</strong>? A ação fica auditada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
