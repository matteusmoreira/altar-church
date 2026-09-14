"use client"

import { useMemo, useState, useTransition } from "react"
import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  LayoutGrid,
  List,
  MapPin,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  PhoneCall,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  acceptCellRequestAction,
  archiveCellRequestAction,
  updateCellRequestStatusAction,
} from "@/lib/cells/requests-actions"
import type {
  CellRequestsMetrics,
  CellVisitRequestItem,
  CellVisitRequestStatus,
  CellWhatsAppSettings,
} from "@/lib/cells/requests-types"
import type { FormUazapiInstanceOption } from "@/lib/forms/types"
import { CellWhatsAppConfigDialog } from "./cell-whatsapp-config-dialog"

export interface CellRequestsTabProps {
  initialRequests: CellVisitRequestItem[]
  initialMetrics: CellRequestsMetrics
  initialSettings: CellWhatsAppSettings
  instances: FormUazapiInstanceOption[]
  cellsList: Array<{ id: string; name: string }>
}

const statusLabels: Record<CellVisitRequestStatus, string> = {
  pending: "Pendente",
  contacted: "Em Contato",
  accepted: "Aceito na Célula",
  archived: "Arquivado",
}

const statusColors: Record<CellVisitRequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  contacted: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  archived: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return phone
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export function CellRequestsTab({
  initialRequests,
  initialMetrics,
  initialSettings,
  instances,
  cellsList,
}: CellRequestsTabProps) {
  const [requests, setRequests] = useState<CellVisitRequestItem[]>(initialRequests)
  const [metrics, setMetrics] = useState<CellRequestsMetrics>(initialMetrics)
  const [settings, setSettings] = useState<CellWhatsAppSettings>(initialSettings)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [isPending, startTransition] = useTransition()

  // Filters
  const [search, setSearch] = useState("")
  const [selectedCell, setSelectedCell] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedPeriod, setSelectedPeriod] = useState<"all" | "today" | "7d" | "30d">("all")

  // Request Details Modal
  const [selectedRequest, setSelectedRequest] = useState<CellVisitRequestItem | null>(null)
  const [referenceTime] = useState(() => Date.now())

  // Filtered requests client-side for ultra-fast response
  const filteredRequests = useMemo(() => {
    return requests.filter((item) => {
      if (selectedCell !== "all" && item.groupId !== selectedCell) return false
      if (selectedStatus !== "all" && item.status !== selectedStatus) return false

      if (selectedPeriod !== "all") {
        const itemDate = new Date(item.createdAt).getTime()
        const diffHours = (referenceTime - itemDate) / (1000 * 60 * 60)
        if (selectedPeriod === "today" && diffHours > 24) return false
        if (selectedPeriod === "7d" && diffHours > 24 * 7) return false
        if (selectedPeriod === "30d" && diffHours > 24 * 30) return false
      }

      if (search.trim()) {
        const query = search.toLowerCase().trim()
        const matchName = item.fullName.toLowerCase().includes(query)
        const matchPhone = item.phone.includes(query)
        const matchNeighborhood = item.neighborhood.toLowerCase().includes(query)
        const matchCell = item.cellName.toLowerCase().includes(query)
        if (!matchName && !matchPhone && !matchNeighborhood && !matchCell) return false
      }

      return true
    })
  }, [requests, search, selectedCell, selectedStatus, selectedPeriod, referenceTime])

  const handleStatusChange = (requestId: string, nextStatus: CellVisitRequestStatus) => {
    startTransition(async () => {
      const res = await updateCellRequestStatusAction({ requestId, status: nextStatus })
      if (!res.ok) {
        toast.error(res.error || "Erro ao atualizar status")
        return
      }
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status: nextStatus } : req)),
      )
      toast.success(`Status alterado para "${statusLabels[nextStatus]}"`)
    })
  }

  const handleAcceptRequest = (requestId: string) => {
    startTransition(async () => {
      const res = await acceptCellRequestAction({ requestId, role: "visitor" })
      if (!res.ok) {
        toast.error(res.error || "Erro ao adicionar participante à célula")
        return
      }
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status: "accepted" } : req)),
      )
      setMetrics((prev) => ({
        ...prev,
        accepted: prev.accepted + 1,
        pending: Math.max(0, prev.pending - 1),
      }))
      toast.success("Visitante adicionado como participante da célula com sucesso!")
    })
  }

  const handleArchive = (requestId: string) => {
    startTransition(async () => {
      const res = await archiveCellRequestAction(requestId)
      if (!res.ok) {
        toast.error(res.error || "Erro ao arquivar solicitação")
        return
      }
      setRequests((prev) =>
        prev.map((req) => (req.id === requestId ? { ...req, status: "archived" } : req)),
      )
      toast.info("Solicitação arquivada.")
    })
  }

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-gradient-to-r from-card via-background to-card p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Inbox className="h-4 w-4" />
            </span>
            <h2 className="text-xl font-bold tracking-tight">Solicitações de Visita às Células</h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Acompanhe as pessoas que solicitaram participar de uma célula pelo mapa 3D ou página pública.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsConfigOpen(true)}
            className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 shadow-sm gap-2"
            variant="outline"
          >
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Configurar Mensagem Automática</span>
            {settings.isEnabled ? (
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="flex h-2 w-2 rounded-full bg-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total de Solicitações
            </CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.total}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Preenchimentos recebidos</p>
          </CardContent>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Pendentes
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.pending}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Aguardando acolhimento inicial</p>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-500/5 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Em Contato
            </CardTitle>
            <PhoneCall className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics.contacted}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Comunicação em andamento</p>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Aceitos na Célula
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.accepted}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5">Integrados como participantes</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card className="border-border/80">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Filtros de Solicitações</CardTitle>
              <CardDescription className="text-xs">
                Refine a lista por célula, status, período ou digite para pesquisar.
              </CardDescription>
            </div>

            {/* Alternador Grade / Lista */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
              <Button
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Grade
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => setViewMode("list")}
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome, fone, bairro..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>

            <div>
              <Select value={selectedCell} onValueChange={(val) => setSelectedCell(val ?? "all")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todas as células" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todas as células</SelectItem>
                  {cellsList.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={selectedStatus} onValueChange={(val) => setSelectedStatus(val ?? "all")}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todos os status</SelectItem>
                  <SelectItem value="pending" className="text-xs">Pendente</SelectItem>
                  <SelectItem value="contacted" className="text-xs">Em Contato</SelectItem>
                  <SelectItem value="accepted" className="text-xs">Aceito na Célula</SelectItem>
                  <SelectItem value="archived" className="text-xs">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={selectedPeriod} onValueChange={(val) => setSelectedPeriod(val as typeof selectedPeriod)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Todo o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Todo o período</SelectItem>
                  <SelectItem value="today" className="text-xs">Hoje (últimas 24h)</SelectItem>
                  <SelectItem value="7d" className="text-xs">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d" className="text-xs">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Display */}
      {filteredRequests.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <CardContent className="flex flex-col items-center justify-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Nenhuma solicitação encontrada</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {search || selectedCell !== "all" || selectedStatus !== "all" || selectedPeriod !== "all"
                  ? "Tente ajustar os filtros acima para encontrar o que procura."
                  : "Quando visitantes preencherem o formulário no mapa público 3D, os dados aparecerão aqui em tempo real."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        /* MODO GRADE */
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRequests.map((req) => {
            const cleanPhone = req.phone.replace(/\D/g, "")
            const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(
              `Olá ${req.fullName}! Sou da liderança da ${req.cellName}. Recebi seu interesse em nos visitar e vim te acolher!`,
            )}`

            return (
              <Card
                key={req.id}
                className="flex flex-col justify-between overflow-hidden border-border/80 transition-all hover:shadow-md hover:border-primary/40"
              >
                <CardHeader className="pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-sm text-primary">
                        {req.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-base leading-snug">{req.fullName}</h3>
                        <p className="text-xs text-muted-foreground">{formatDate(req.createdAt)}</p>
                      </div>
                    </div>

                    <Badge className={statusColors[req.status]}>
                      {statusLabels[req.status]}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 pt-1 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{req.cellName}</span>
                      {req.cellCategory && (
                        <span className="text-muted-foreground text-[11px]">({req.cellCategory})</span>
                      )}
                    </div>

                    {req.leaderName && (
                      <p className="text-muted-foreground text-[11px]">
                        Líder da Célula: <strong className="text-foreground">{req.leaderName}</strong>
                      </p>
                    )}

                    {req.neighborhood && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
                        <span>Bairro: {req.neighborhood}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pb-3">
                  {req.notes && (
                    <div className="rounded-xl border bg-muted/30 p-2.5 text-xs text-muted-foreground">
                      <p className="line-clamp-2 italic">&ldquo;{req.notes}&rdquo;</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-1 border-t">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      <span>{formatPhone(req.phone)}</span>
                    </a>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Detalhes
                    </Button>
                  </div>
                </CardContent>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t bg-muted/10 p-2.5 gap-2">
                  {req.status !== "accepted" ? (
                    <Button
                      size="sm"
                      className="gradient-primary h-8 text-xs font-semibold flex-1 gap-1.5 shadow-xs"
                      disabled={isPending}
                      onClick={() => handleAcceptRequest(req.id)}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Aceitar na Célula
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 py-1 px-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Participante Ativo</span>
                    </div>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={isPending}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      aria-label="Ações da solicitação"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStatusChange(req.id, "contacted")}>
                        <PhoneCall className="h-3.5 w-3.5 mr-2 text-blue-500" />
                        Marcar Em Contato
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleStatusChange(req.id, "pending")}>
                        <Clock className="h-3.5 w-3.5 mr-2 text-amber-500" />
                        Marcar Pendente
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleArchive(req.id)}
                      >
                        <Archive className="h-3.5 w-3.5 mr-2" />
                        Arquivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        /* MODO LISTA */
        <Card className="overflow-hidden border-border/80">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] tracking-wider border-b">
                <tr>
                  <th className="py-3 px-4">Visitante</th>
                  <th className="py-3 px-4">Célula</th>
                  <th className="py-3 px-4">Bairro</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRequests.map((req) => {
                  const cleanPhone = req.phone.replace(/\D/g, "")
                  const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(
                    `Olá ${req.fullName}! Sou da liderança da ${req.cellName}. Recebi seu interesse em nos visitar e vim te acolher!`,
                  )}`

                  return (
                    <tr key={req.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground text-sm">{req.fullName}</div>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline mt-0.5"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {formatPhone(req.phone)}
                        </a>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{req.cellName}</div>
                        {req.leaderName && (
                          <div className="text-[11px] text-muted-foreground">Líder: {req.leaderName}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        {req.neighborhood || "—"}
                      </td>

                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                        {formatDate(req.createdAt)}
                      </td>

                      <td className="py-3 px-4">
                        <Badge className={statusColors[req.status]}>
                          {statusLabels[req.status]}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {req.status !== "accepted" ? (
                            <Button
                              size="sm"
                              className="gradient-primary h-7 text-xs font-semibold gap-1 shadow-xs"
                              disabled={isPending}
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              <UserPlus className="h-3 w-3" />
                              Aceitar
                            </Button>
                          ) : (
                            <Badge variant="secondary" className="text-[11px] text-emerald-600 bg-emerald-500/10">
                              Integrado
                            </Badge>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => setSelectedRequest(req)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={isPending}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              aria-label="Ações da solicitação"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleStatusChange(req.id, "contacted")}>
                                <PhoneCall className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                Marcar Em Contato
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleStatusChange(req.id, "pending")}>
                                <Clock className="h-3.5 w-3.5 mr-2 text-amber-500" />
                                Marcar Pendente
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleArchive(req.id)}
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" />
                                Arquivar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de Detalhes da Solicitação */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        {selectedRequest && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg">Detalhes da Solicitação</DialogTitle>
              <DialogDescription>
                Informações preenchidas pelo visitante para visita à célula.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Nome Completo</Label>
                  <p className="font-semibold text-foreground text-sm mt-0.5">{selectedRequest.fullName}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Telefone / WhatsApp</Label>
                  <p className="font-semibold text-foreground text-sm mt-0.5">{formatPhone(selectedRequest.phone)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-muted/30 border">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Célula Solicitada</Label>
                  <p className="font-semibold text-primary mt-0.5">{selectedRequest.cellName}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Bairro Informado</Label>
                  <p className="font-medium text-foreground mt-0.5">{selectedRequest.neighborhood || "Não informado"}</p>
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="p-3 rounded-xl bg-muted/30 border space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase">Mensagem ou Pedido de Oração</Label>
                  <p className="text-foreground whitespace-pre-wrap leading-relaxed">{selectedRequest.notes}</p>
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                <span>Registrado em: {formatDate(selectedRequest.createdAt)}</span>
                <Badge className={statusColors[selectedRequest.status]}>
                  {statusLabels[selectedRequest.status]}
                </Badge>
              </div>
            </div>

            <DialogFooter className="sm:justify-between gap-2 pt-3 border-t">
              <a
                href={`https://wa.me/55${selectedRequest.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Conversar no WhatsApp
              </a>

              {selectedRequest.status !== "accepted" && (
                <Button
                  onClick={() => {
                    handleAcceptRequest(selectedRequest.id)
                    setSelectedRequest(null)
                  }}
                  className="gradient-primary text-xs font-semibold"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  Aceitar na Célula
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Modal de Configuração de WhatsApp */}
      <CellWhatsAppConfigDialog
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        settings={settings}
        instances={instances}
        onSaved={(newSettings) => setSettings(newSettings)}
      />
    </div>
  )
}
