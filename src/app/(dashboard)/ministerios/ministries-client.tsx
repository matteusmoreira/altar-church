"use client"

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, Grid2X2, Heart, List, MoreVertical, Plus, Search, Trash2, User, Users } from "lucide-react"
import { toast } from "sonner"
import { deleteMinistry, saveMinistry } from "@/lib/pastoral/actions"
import { slugifyMinistry } from "@/lib/ministries/slug"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState, MetricCard, MetricGrid, PageHeader, ViewToggle } from "@/components/shared"
import { MinistryMembershipManager } from "@/components/member/ministry-membership-manager"
import type { MinistryMembershipAdminItem } from "@/lib/member/types"

interface MinistriesClientProps {
  ministriesResult: MinistriesListResult
  filters: PastoralListFilters
  leaderCandidates: { id: string; fullName: string }[]
  memberships?: MinistryMembershipAdminItem[]
  initialTab?: string
}

interface MinistryFormState {
  id: string | null
  companyId: string | null
  name: string
  slug: string
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
  slug: "",
  description: "",
  contact: "",
  leaderPersonId: "",
  isActive: true,
}

type ViewMode = "list" | "grid"

const MINISTRIES_VIEW_MODE_KEY = "altar-church:ministries-view-mode"
const MINISTRIES_VIEW_MODE_EVENT = "altar-church:ministries-view-mode-change"
let currentMinistriesViewMode: ViewMode = "grid"

function subscribeToMinistriesViewMode(callback: () => void) {
  window.addEventListener(MINISTRIES_VIEW_MODE_EVENT, callback)
  return () => window.removeEventListener(MINISTRIES_VIEW_MODE_EVENT, callback)
}

function getMinistriesViewMode(): ViewMode {
  try {
    const storedViewMode = window.localStorage.getItem(MINISTRIES_VIEW_MODE_KEY)
    if (storedViewMode === "list" || storedViewMode === "grid") currentMinistriesViewMode = storedViewMode
  } catch { }
  return currentMinistriesViewMode
}

function getServerViewMode(): ViewMode {
  return "grid"
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
    slug: ministry.slug || "",
    description: ministry.description,
    contact: ministry.contact,
    leaderPersonId: ministry.leaderPersonId ?? "",
    isActive: ministry.isActive,
  }
}

export function MinistriesClient({
  ministriesResult,
  filters,
  leaderCandidates,
  memberships = [],
  initialTab = "ministerios",
}: MinistriesClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/ministerios"
  const ministries = ministriesResult.items
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingMinistry, setEditingMinistry] = useState<MinistryListItem | null>(null)
  const [deletingMinistry, setDeletingMinistry] = useState<MinistryListItem | null>(null)
  const [formData, setFormData] = useState<MinistryFormState>(emptyForm)
  const viewMode = useSyncExternalStore(subscribeToMinistriesViewMode, getMinistriesViewMode, getServerViewMode)
  const [filterState, setFilterState] = useState<FilterState>({
    search: filters.search ?? "",
    isActive: toFilterChoice(filters.isActive),
  })

  const activeMinistries = ministries.filter((ministry) => ministry.isActive).length
  const totalMembers = ministries.reduce((sum, ministry) => sum + ministry.memberCount, 0)
  const pendingRequestsCount = memberships.filter((item) => item.status === "pending").length
  const activeMembersCount = memberships.filter((item) => item.status === "active").length

  const handleTabChange = (nextTab: string) => {
    setActiveTab(nextTab)
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")
    if (nextTab === "ministerios") {
      params.delete("tab")
      params.delete("aba")
    } else {
      params.set("tab", nextTab)
    }
    const query = params.toString()
    router.replace(query ? `${routePath}?${query}` : routePath, { scroll: false })
  }

  const updateRoute = (nextFilters: FilterState, page = 1) => {
    const params = new URLSearchParams()
    if (activeTab && activeTab !== "ministerios") params.set("tab", activeTab)
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
    try {
      const result = await saveMinistry({
      id: formData.id,
      companyId: formData.companyId,
      name: formData.name,
      slug: formData.slug || undefined,
      description: formData.description,
      contact: formData.contact,
      leaderPersonId: formData.leaderPersonId || null,
      isActive: formData.isActive,
    })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar o ministério")
        return
      }

    toast.success(editingMinistry ? "Ministério atualizado com sucesso" : "Ministério cadastrado com sucesso")
    setDialogOpen(false)
    setEditingMinistry(null)
    setFormData(emptyForm)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o ministério")
    } finally {
      setIsSaving(false)
    }
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
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  const changeViewMode = (nextViewMode: ViewMode) => {
    currentMinistriesViewMode = nextViewMode
    try {
      window.localStorage.setItem(MINISTRIES_VIEW_MODE_KEY, nextViewMode)
    } catch { }
    window.dispatchEvent(new Event(MINISTRIES_VIEW_MODE_EVENT))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Ministérios"
        description="Gerencie ministérios com dados persistidos por igreja."
        actions={
          <Button onClick={openCreateDialog} variant="brand" className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Novo Ministério
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="flex h-auto w-fit flex-wrap gap-1 rounded-xl border bg-muted/60 p-1">
          <TabsTrigger value="ministerios" className="flex items-center gap-2 px-3.5 py-2">
            <Heart className="h-4 w-4 text-primary" />
            <span>Ministérios</span>
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {ministriesResult.total}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="participantes" className="flex items-center gap-2 px-3.5 py-2">
            <Users className="h-4 w-4 text-primary" />
            <span>Participantes e solicitações</span>
            {pendingRequestsCount > 0 ? (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs animate-pulse">
                {pendingRequestsCount} {pendingRequestsCount === 1 ? "pendente" : "pendentes"}
              </Badge>
            ) : memberships.length > 0 ? (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                {activeMembersCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ministerios" className="mt-0 space-y-6">
          <MetricGrid columns={3}>
            <MetricCard title="Total" value={ministriesResult.total} icon={Heart} tone="primary" />
            <MetricCard title="Ativos nesta página" value={activeMinistries} icon={Users} tone="success" />
            <MetricCard title="Participantes vinculados" value={totalMembers} icon={User} tone="info" />
          </MetricGrid>

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
            <ViewToggle
              value={viewMode}
              onChange={changeViewMode}
              ariaLabel="Modo de visualização"
              className="self-end sm:self-auto"
              options={[
                { value: "list", label: "Ver ministérios em lista", icon: List },
                { value: "grid", label: "Ver ministérios em grade", icon: Grid2X2 },
              ]}
            />
          </form>

          <div className={viewMode === "grid" ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
            {ministries.map((ministry) => (
              <Card key={ministry.id} className="glass overflow-hidden group">
                <CardHeader className={viewMode === "grid" ? "pb-3" : "pb-2"}>
                  <div className={viewMode === "grid" ? "flex items-start justify-between gap-3" : "flex items-center justify-between gap-3"}>
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
                <CardContent className={viewMode === "grid" ? "space-y-3" : "flex flex-col gap-3 p-4 pt-0 sm:flex-row sm:items-center sm:py-4"}>
                  <p className={viewMode === "grid" ? "line-clamp-2 text-sm text-muted-foreground" : "min-w-0 flex-1 text-sm text-muted-foreground sm:line-clamp-1"}>
                    {ministry.description || "Sem descrição cadastrada."}
                  </p>
                  <div className={viewMode === "grid" ? "space-y-2 text-sm text-muted-foreground" : "flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"}>
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
                  <Link href={`/ministerios/${ministry.slug || ministry.id}`} className={viewMode === "grid" ? "inline-flex min-h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground" : "inline-flex min-h-9 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto sm:min-w-36"}>Abrir gestão</Link>
                </CardContent>
              </Card>
            ))}
          </div>

          {ministries.length === 0 && (
            <EmptyState icon={Heart} title="Nenhum ministério encontrado" />
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
        </TabsContent>

        <TabsContent value="participantes" className="mt-0 space-y-6">
          <MinistryMembershipManager memberships={memberships} />
        </TabsContent>
      </Tabs>

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
                onChange={(event) => {
                  const nextName = event.target.value
                  const currentAutoSlug = slugifyMinistry(formData.name)
                  const shouldAutoSlug = !formData.slug || formData.slug === currentAutoSlug
                  setFormData({
                    ...formData,
                    name: nextName,
                    slug: shouldAutoSlug ? slugifyMinistry(nextName) : formData.slug,
                  })
                }}
                placeholder="Nome do ministério"
              />
            </div>
            <div className="grid gap-2">
              <Label>Link de acesso amigável (slug)</Label>
              <div className="flex items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:border-input">
                <span>/ministerios/</span>
                <Input
                  value={formData.slug}
                  onChange={(event) =>
                    setFormData({
                      ...formData,
                      slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    })
                  }
                  placeholder="ex: homens"
                  className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Ex.: /ministerios/homens. Se deixar em branco, geramos automaticamente.
              </p>
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
            <Button onClick={handleSave} variant="brand" disabled={isSaving}>
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
