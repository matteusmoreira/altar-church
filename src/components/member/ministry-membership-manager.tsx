"use client"

import { useMemo, useState, useSyncExternalStore, useTransition } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  Calendar,
  Check,
  Clock3,
  Grid2X2,
  List,
  Search,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { reviewMinistryMembership } from "@/lib/member/actions"
import type { MinistryMembershipAdminItem } from "@/lib/member/types"
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
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ViewMode = "list" | "grid"
type StatusFilter = "all" | "pending" | "active"

const MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY = "altar-church:ministry-memberships-view-mode"
const MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT = "altar-church:ministry-memberships-view-mode-change"
let currentMinistryMembershipsViewMode: ViewMode = "list"

function subscribeToMinistryMembershipsViewMode(callback: () => void) {
  window.addEventListener(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT, callback)
  return () => window.removeEventListener(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT, callback)
}

function getMinistryMembershipsViewMode(): ViewMode {
  try {
    const storedViewMode = window.localStorage.getItem(MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY)
    if (storedViewMode === "list" || storedViewMode === "grid") currentMinistryMembershipsViewMode = storedViewMode
  } catch { }
  return currentMinistryMembershipsViewMode
}

function getServerViewMode(): ViewMode {
  return "list"
}

function formatDate(value?: string | null) {
  if (!value) return null
  try {
    return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR })
  } catch {
    return null
  }
}

export function MinistryMembershipManager({ memberships = [] }: { memberships?: MinistryMembershipAdminItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const viewMode = useSyncExternalStore(subscribeToMinistryMembershipsViewMode, getMinistryMembershipsViewMode, getServerViewMode)

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [selectedMinistry, setSelectedMinistry] = useState<string>("all")
  const [removingItem, setRemovingItem] = useState<MinistryMembershipAdminItem | null>(null)

  const changeViewMode = (nextViewMode: ViewMode) => {
    currentMinistryMembershipsViewMode = nextViewMode
    try {
      window.localStorage.setItem(MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY, nextViewMode)
    } catch { }
    window.dispatchEvent(new Event(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT))
  }

  // Lista única de ministérios para o filtro
  const ministryOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of memberships) {
      if (item.ministryId && item.ministryName) {
        map.set(item.ministryId, item.ministryName)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [memberships])

  const pendingRequests = useMemo(() => memberships.filter((item) => item.status === "pending"), [memberships])
  const activeMembers = useMemo(() => memberships.filter((item) => item.status === "active"), [memberships])

  // Itens filtrados com busca e ministério selecionado
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return memberships.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false
      if (selectedMinistry !== "all" && item.ministryId !== selectedMinistry) return false
      if (query) {
        const matchPerson = (item.personName || "").toLowerCase().includes(query)
        const matchMinistry = (item.ministryName || "").toLowerCase().includes(query)
        if (!matchPerson && !matchMinistry) return false
      }
      return true
    })
  }, [memberships, statusFilter, selectedMinistry, search])

  const filteredRequests = useMemo(() => filteredItems.filter((item) => item.status === "pending"), [filteredItems])
  const filteredActive = useMemo(() => filteredItems.filter((item) => item.status === "active"), [filteredItems])

  function review(membershipId: string, decision: "approve" | "reject" | "remove") {
    startTransition(async () => {
      const result = await reviewMinistryMembership({ membershipId, decision })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível revisar")
      } else {
        toast.success(
          decision === "approve"
            ? "Participante aprovado com sucesso"
            : decision === "reject"
              ? "Solicitação rejeitada"
              : "Participante removido do ministério"
        )
        setRemovingItem(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Indicadores rápidos */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Solicitações pendentes</p>
                <p className="text-2xl font-bold">{pendingRequests.length}</p>
              </div>
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  pendingRequests.length > 0 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"
                }`}
              >
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Participantes ativos</p>
                <p className="text-2xl font-bold">{activeMembers.length}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass py-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-muted-foreground">Total de vínculos</p>
                <p className="text-2xl font-bold">{memberships.length}</p>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserCheck className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por participante ou ministério..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtro por Ministério */}
        {ministryOptions.length > 1 && (
          <Select value={selectedMinistry} onValueChange={(val) => setSelectedMinistry(val ?? "all")}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Todos os ministérios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os ministérios</SelectItem>
              {ministryOptions.map((ministry) => (
                <SelectItem key={ministry.id} value={ministry.id}>
                  {ministry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Filtro rápido por Status */}
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
          <Button
            type="button"
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setStatusFilter("all")}
          >
            Todos ({memberships.length})
          </Button>
          <Button
            type="button"
            variant={statusFilter === "pending" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setStatusFilter("pending")}
          >
            Pendentes
            {pendingRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 px-1 py-0 text-[10px]">
                {pendingRequests.length}
              </Badge>
            )}
          </Button>
          <Button
            type="button"
            variant={statusFilter === "active" ? "secondary" : "ghost"}
            size="sm"
            className="h-8 px-3 text-xs"
            onClick={() => setStatusFilter("active")}
          >
            Ativos ({activeMembers.length})
          </Button>
        </div>

        {/* Modo de Visualização */}
        <div className="flex w-fit self-end rounded-md border p-1 sm:self-auto" aria-label="Modo de visualização">
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Ver em lista"
            aria-pressed={viewMode === "list"}
            title="Lista"
            onClick={() => changeViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Ver em grade"
            aria-pressed={viewMode === "grid"}
            title="Grade"
            onClick={() => changeViewMode("grid")}
          >
            <Grid2X2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Conteúdo das seções */}
      <div className="space-y-6">
        {/* Seção de Solicitações Pendentes */}
        {(statusFilter === "all" || statusFilter === "pending") && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Clock3 className="h-4 w-4 text-warning" />
                Solicitações Pendentes ({filteredRequests.length})
              </h3>
            </div>

            {filteredRequests.length > 0 ? (
              <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2" : "space-y-2.5"}>
                {filteredRequests.map((item) => {
                  const reqDate = formatDate(item.requestedAt)
                  return (
                    <div
                      key={item.id}
                      className={
                        viewMode === "grid"
                          ? "flex h-full flex-col justify-between gap-3 rounded-xl border bg-card/60 p-4 shadow-xs"
                          : "flex flex-col gap-3 rounded-xl border bg-card/60 p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                      }
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{item.personName}</p>
                          <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning text-xs">
                            Pendente
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.ministryName}</p>
                        {reqDate && (
                          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Calendar className="h-3 w-3" /> Solicitado em {reqDate}
                          </p>
                        )}
                      </div>

                      <div className={viewMode === "grid" ? "flex items-center gap-2 pt-2" : "flex shrink-0 items-center gap-2"}>
                        <Button
                          size="sm"
                          disabled={pending}
                          className="gradient-primary h-8"
                          onClick={() => review(item.id, "approve")}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          className="h-8"
                          onClick={() => review(item.id, "reject")}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma solicitação pendente no momento.
              </div>
            )}
          </div>
        )}

        {/* Seção de Participantes Ativos */}
        {(statusFilter === "all" || statusFilter === "active") && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Users className="h-4 w-4 text-success" />
                Participantes Ativos ({filteredActive.length})
              </h3>
            </div>

            {filteredActive.length > 0 ? (
              <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-2.5"}>
                {filteredActive.map((item) => (
                  <div
                    key={item.id}
                    className={
                      viewMode === "grid"
                        ? "flex h-full flex-col justify-between gap-3 rounded-xl border bg-card/60 p-4 shadow-xs"
                        : "flex items-center justify-between gap-3 rounded-xl border bg-card/60 p-3.5 shadow-xs"
                    }
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{item.personName}</p>
                        {item.role === "leader" ? (
                          <Badge className="border-primary/30 bg-primary/10 text-primary text-xs flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Líder
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Membro
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.ministryName}</p>
                    </div>

                    <div className={viewMode === "grid" ? "flex justify-end pt-2" : "shrink-0"}>
                      {item.role === "leader" ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={pending}
                          onClick={() => setRemovingItem(item)}
                        >
                          <UserMinus className="mr-1.5 h-3.5 w-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum participante ativo encontrado.
              </div>
            )}
          </div>
        )}

        {/* Estado vazio quando não há nada na pesquisa */}
        {filteredItems.length === 0 && search.trim() !== "" && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Nenhum resultado encontrado</p>
            <p className="text-xs text-muted-foreground">
              Não encontramos participantes ou solicitações para o termo "{search}".
            </p>
          </div>
        )}
      </div>

      {/* Dialog de Confirmação para Remoção */}
      <AlertDialog open={!!removingItem} onOpenChange={(open) => !open && setRemovingItem(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover participante?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover <strong>{removingItem?.personName}</strong> do ministério{" "}
              <strong>{removingItem?.ministryName}</strong>? O vínculo será inativado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={pending}
              onClick={() => removingItem && review(removingItem.id, "remove")}
            >
              {pending ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

