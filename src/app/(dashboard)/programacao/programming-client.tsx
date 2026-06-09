"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarDays, Edit, MoreVertical, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteProgramming, saveProgramming } from "@/lib/pastoral/actions"
import type { PastoralListFilters, ProgrammingListItem, ProgrammingsListResult } from "@/lib/pastoral/types"
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

interface ProgrammingClientProps {
  programmingsResult: ProgrammingsListResult
  filters: PastoralListFilters
}

interface ProgrammingFormState {
  id: string | null
  companyId: string | null
  title: string
  description: string
  date: string
  durationMinutes: number
  isRecurring: boolean
  isLive: boolean
  allowPublicChat: boolean
  sendPushNotification: boolean
  isActive: boolean
}

interface FilterState {
  search: string
  isActive: string
}

const emptyForm: ProgrammingFormState = {
  id: null,
  companyId: null,
  title: "",
  description: "",
  date: "",
  durationMinutes: 60,
  isRecurring: false,
  isLive: false,
  allowPublicChat: false,
  sendPushNotification: false,
  isActive: true,
}

function formatDate(value: string) {
  if (!value) return "Sem data"
  return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
}

function toFilterChoice(value: boolean | null | undefined) {
  if (value === true) return "yes"
  if (value === false) return "no"
  return "all"
}

function boolLabel(value: boolean, activeLabel = "Sim", inactiveLabel = "Não") {
  return value ? activeLabel : inactiveLabel
}

function statusBadge(value: boolean, activeLabel = "Ativo", inactiveLabel = "Inativo") {
  return (
    <Badge
      className={
        value
          ? "bg-success/10 text-success border-success/20"
          : "bg-muted text-muted-foreground border-border/40"
      }
    >
      {boolLabel(value, activeLabel, inactiveLabel)}
    </Badge>
  )
}

function programmingToForm(programming: ProgrammingListItem): ProgrammingFormState {
  return {
    id: programming.id,
    companyId: programming.companyId,
    title: programming.title,
    description: programming.description,
    date: programming.date,
    durationMinutes: programming.durationMinutes,
    isRecurring: programming.isRecurring,
    isLive: programming.isLive,
    allowPublicChat: programming.allowPublicChat,
    sendPushNotification: programming.sendPushNotification,
    isActive: programming.isActive,
  }
}

export function ProgrammingClient({ programmingsResult, filters }: ProgrammingClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/programacao"
  const programmings = programmingsResult.items
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingProgramming, setEditingProgramming] = useState<ProgrammingListItem | null>(null)
  const [deletingProgramming, setDeletingProgramming] = useState<ProgrammingListItem | null>(null)
  const [formData, setFormData] = useState<ProgrammingFormState>(emptyForm)
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
    router.push(query ? `${routePath}?${query}` : routePath)
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState)
  }

  const openCreateDialog = () => {
    setEditingProgramming(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (programming: ProgrammingListItem) => {
    setEditingProgramming(programming)
    setFormData(programmingToForm(programming))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Informe o título da programação")
      return
    }

    setIsSaving(true)
    const result = await saveProgramming(formData)
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a programação")
      return
    }

    toast.success(editingProgramming ? "Programação atualizada com sucesso" : "Programação cadastrada com sucesso")
    setDialogOpen(false)
    setEditingProgramming(null)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingProgramming) return

    setIsDeleting(true)
    const result = await deleteProgramming({
      id: deletingProgramming.id,
      companyId: deletingProgramming.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir a programação")
      return
    }

    toast.success("Programação removida com sucesso")
    setDeleteDialogOpen(false)
    setDeletingProgramming(null)
    router.refresh()
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Programação</h1>
          <p className="text-muted-foreground">Planeje cultos e encontros com dados persistidos.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova Programação
        </Button>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar programação"
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
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="yes">Ativos</SelectItem>
            <SelectItem value="no">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2">
        {programmings.map((programming) => (
          <Card key={programming.id} className="glass">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{programming.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{formatDate(programming.date)}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(programming)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingProgramming(programming)
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
            <CardContent className="space-y-4">
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {programming.description || "Sem descrição cadastrada."}
              </p>
              <div className="flex flex-wrap gap-2">
                {statusBadge(programming.isActive)}
                {statusBadge(programming.isRecurring, "Recorrente", "Único")}
                {statusBadge(programming.isLive, "Ao vivo", "Presencial")}
                {statusBadge(programming.sendPushNotification, "Push", "Sem push")}
                {statusBadge(programming.allowPublicChat, "Chat público", "Sem chat")}
              </div>
              <p className="text-xs text-muted-foreground">Duração: {programming.durationMinutes} minutos</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {programmings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma programação encontrada</p>
        </div>
      )}

      {programmingsResult.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {programmingsResult.page} de {programmingsResult.pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={programmingsResult.page <= 1}
              onClick={() => goToPage(programmingsResult.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={programmingsResult.page >= programmingsResult.pageCount}
              onClick={() => goToPage(programmingsResult.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingProgramming ? "Editar Programação" : "Nova Programação"}</DialogTitle>
            <DialogDescription>
              {editingProgramming ? "Atualize os dados da programação." : "Cadastre uma programação real."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                placeholder="Culto de domingo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                placeholder="Resumo da programação"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Data</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Duração em minutos</Label>
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={formData.durationMinutes}
                  onChange={(event) => setFormData({ ...formData, durationMinutes: Number(event.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                ["isRecurring", "Recorrente?"],
                ["isLive", "Ao vivo?"],
                ["sendPushNotification", "Enviar push?"],
                ["allowPublicChat", "Chat público?"],
                ["isActive", "Ativo?"],
              ].map(([field, label]) => (
                <div key={field} className="grid gap-2">
                  <Label>{label}</Label>
                  <Select
                    value={formData[field as keyof ProgrammingFormState] ? "true" : "false"}
                    onValueChange={(value) =>
                      setFormData({ ...formData, [field]: value === "true" })
                    }
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
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingProgramming ? "Salvar alterações" : "Criar programação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir programação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingProgramming?.title}</strong>? O registro será removido da operação ativa.
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
