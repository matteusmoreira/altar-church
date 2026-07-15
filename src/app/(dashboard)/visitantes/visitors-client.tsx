"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, Heart, MoreVertical, Plus, Search, Trash2, UserCheck, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"
import { deletePerson, savePerson } from "@/lib/people/actions"
import type { PeopleListFilters, PeopleListResult, PersonListItem } from "@/lib/people/types"
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

type VisitorStage = "new" | "contacted" | "following" | "converted" | "inactive"
type VisitorSource = "event" | "cell" | "online" | "referral" | "walk-in"

interface VisitorsClientProps {
  visitorsResult: PeopleListResult
  filters: PeopleListFilters
}

interface VisitorFormState {
  id: string | null
  companyId: string | null
  congregationId: string | null
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
  event: "Evento",
  cell: "Célula",
  online: "Online",
  referral: "Indicação",
  "walk-in": "Espontâneo",
}

const stageValues: VisitorStage[] = ["new", "contacted", "following", "converted", "inactive"]
const sourceValues: VisitorSource[] = ["event", "cell", "online", "referral", "walk-in"]

const emptyForm: VisitorFormState = {
  id: null,
  companyId: null,
  congregationId: null,
  name: "",
  email: "",
  phone: "",
  source: "event",
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

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  }
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
  return "event"
}

function visitorToForm(visitor: PersonListItem): VisitorFormState {
  return {
    id: visitor.id,
    companyId: visitor.companyId,
    congregationId: visitor.congregationId,
    name: visitor.fullName,
    email: visitor.email ?? "",
    phone: visitor.phone,
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
  return format(parseISO(value), "dd MMM yyyy", { locale: ptBR })
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Card className="glass overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function VisitorsClient({ visitorsResult, filters }: VisitorsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/visitantes"
  const visitors = visitorsResult.people
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<PersonListItem | null>(null)
  const [deletingVisitor, setDeletingVisitor] = useState<PersonListItem | null>(null)
  const [formData, setFormData] = useState<VisitorFormState>(emptyForm)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    stage: "all",
  })

  const filteredVisitors = visitors.filter((visitor) => {
    const stage = normalizeStage(visitor)
    return filterState.stage === "all" || stage === filterState.stage
  })
  const converted = visitors.filter((visitor) => normalizeStage(visitor) === "converted").length
  const following = visitors.filter((visitor) => normalizeStage(visitor) === "following").length
  const newThisPage = visitors.filter((visitor) => normalizeStage(visitor) === "new").length

  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim())
    if (page > 1) params.set("page", String(page))

    const query = params.toString()
    router.push(query ? `${routePath}?${query}` : routePath)
  }

  const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    updateRoute(filterState)
  }

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
      toast.error("Informe o nome do visitante")
      return
    }

    setIsSaving(true)
    const result = await savePerson({
      id: formData.id,
      companyId: formData.companyId,
      congregationId: formData.congregationId,
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
      toast.error(result.error ?? "Não foi possível salvar o visitante")
      return
    }

    toast.success(editingVisitor ? "Visitante atualizado com sucesso" : "Visitante cadastrado com sucesso")
    setDialogOpen(false)
    setEditingVisitor(null)
    setFormData(emptyForm)
    router.refresh()
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
      toast.error(result.error ?? "Não foi possível excluir o visitante")
      return
    }

    toast.success("Visitante removido com sucesso")
    setDeleteDialogOpen(false)
    setDeletingVisitor(null)
    router.refresh()
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gestão de Visitantes</h1>
          <p className="text-muted-foreground">Acompanhe visitantes usando o cadastro real de pessoas.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Novo Visitante
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total de Visitantes" value={String(visitorsResult.total)} icon={Users} color="gradient-primary" />
        <StatCard title="Novos nesta página" value={String(newThisPage)} icon={UserPlus} color="bg-info" />
        <StatCard title="Convertidos" value={String(converted)} icon={UserCheck} color="bg-success" />
        <StatCard title="Acompanhando" value={String(following)} icon={Heart} color="bg-primary" />
      </div>

      <Card className="glass">
        <CardHeader>
          <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, e-mail ou telefone"
                value={filterState.search}
                onChange={(event) => setFilterState({ ...filterState, search: event.target.value })}
                className="pl-9 md:pl-9"
              />
            </div>
            <Select
              value={filterState.stage}
              onValueChange={(value) => setFilterState({ ...filterState, stage: value ?? "all" })}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {stageValues.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {statusLabels[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              Filtrar
            </Button>
          </form>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredVisitors.map((visitor) => {
            const stage = normalizeStage(visitor)
            const source = normalizeSource(visitor.accessProfile)
            return (
              <div key={visitor.id} className="flex flex-col gap-3 rounded-lg border border-border/30 p-3 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="text-xs gradient-primary text-white">
                      {initials(visitor.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{visitor.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[visitor.phone, visitor.email].filter(Boolean).join(" · ") || "Sem contato"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusColors[stage]}>{statusLabels[stage]}</Badge>
                  <Badge variant="outline">{sourceLabels[source]}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(visitor.createdAt)}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(visitor)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingVisitor(visitor)
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
            )
          })}

          {filteredVisitors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">Nenhum visitante encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      {visitorsResult.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {visitorsResult.page} de {visitorsResult.pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={visitorsResult.page <= 1}
              onClick={() => goToPage(visitorsResult.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={visitorsResult.page >= visitorsResult.pageCount}
              onClick={() => goToPage(visitorsResult.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVisitor ? "Editar Visitante" : "Novo Visitante"}</DialogTitle>
            <DialogDescription>
              {editingVisitor ? "Atualize o acompanhamento do visitante." : "Cadastre um visitante no núcleo real de pessoas."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome completo *</Label>
              <Input
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Nome do visitante"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(event) => setFormData({ ...formData, email: event.target.value })}
                  placeholder="email@exemplo.com"
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Origem</Label>
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
                <Label>Status</Label>
                <Select
                  value={formData.stage}
                  onValueChange={(value) =>
                    setFormData({ ...formData, stage: stageValues.includes(value as VisitorStage) ? (value as VisitorStage) : "new" })
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
            <div className="grid gap-2">
              <Label>Observações internas</Label>
              <Input
                value={formData.internalNotes}
                onChange={(event) => setFormData({ ...formData, internalNotes: event.target.value })}
                placeholder="Observações rápidas para acompanhamento"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingVisitor ? "Salvar alterações" : "Cadastrar visitante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir visitante</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingVisitor?.fullName}</strong>? O cadastro será removido da operação ativa.
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
