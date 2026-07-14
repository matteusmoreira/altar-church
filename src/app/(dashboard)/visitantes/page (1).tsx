"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Users,
  UserPlus,
  UserCheck,
  Heart,
  Eye,
} from "lucide-react"
import { mockVisitors } from "@/lib/mock/data"
import type { Visitor } from "@/lib/types"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const statusColors = {
  new: "bg-info/10 text-info border-info/20",
  contacted: "bg-warning/10 text-warning border-warning/20",
  following: "bg-primary/10 text-primary border-primary/20",
  converted: "bg-success/10 text-success border-success/20",
  inactive: "bg-destructive/10 text-destructive border-destructive/20",
}

const statusLabels = {
  new: "Novo",
  contacted: "Contactado",
  following: "Acompanhando",
  converted: "Convertido",
  inactive: "Inativo",
}

const sourceLabels = {
  event: "Evento",
  cell: "Célula",
  online: "Online",
  referral: "Indicação",
  "walk-in": "Espontâneo",
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

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>(mockVisitors)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null)
  const [deletingVisitor, setDeletingVisitor] = useState<Visitor | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    source: "event" as Visitor["source"],
    status: "new" as Visitor["status"],
    assignedTo: "",
    notes: "",
  })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const totalVisitors = visitors.length
  const newThisMonth = visitors.filter((v) => {
    const d = parseISO(v.firstVisitDate)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }).length
  const converted = visitors.filter((v) => v.status === "converted").length
  const following = visitors.filter((v) => v.status === "following").length

  const filteredVisitors = visitors.filter((v) => {
    const matchesSearch =
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase()) ||
      v.phone.includes(search)
    const matchesStatus = statusFilter === "all" || v.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      phone: "",
      source: "event",
      status: "new",
      assignedTo: "",
      notes: "",
    })
    setEditingVisitor(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (visitor: Visitor) => {
    setEditingVisitor(visitor)
    setFormData({
      name: visitor.name,
      email: visitor.email,
      phone: visitor.phone,
      source: visitor.source,
      status: visitor.status,
      assignedTo: visitor.assignedToName || "",
      notes: visitor.notes || "",
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.name) {
      toast.error("Preencha os campos obrigatórios")
      return
    }

    if (editingVisitor) {
      setVisitors((prev) =>
        prev.map((v) =>
          v.id === editingVisitor.id
            ? { ...v, ...formData, assignedToName: formData.assignedTo || undefined }
            : v
        )
      )
      toast.success("Visitante atualizado com sucesso!")
    } else {
      const today = new Date().toISOString().split("T")[0]
      const newVisitor: Visitor = {
        id: `v${Date.now()}`,
        churchId: "c1",
        ...formData,
        assignedToName: formData.assignedTo || undefined,
        firstVisitDate: today,
        lastVisitDate: today,
        visitCount: 1,
        createdAt: today,
      }
      setVisitors((prev) => [newVisitor, ...prev])
      toast.success("Visitante cadastrado com sucesso!")
    }
    setDialogOpen(false)
    resetForm()
  }

  const handleDelete = () => {
    if (deletingVisitor) {
      setVisitors((prev) => prev.filter((v) => v.id !== deletingVisitor.id))
      toast.success("Visitante removido com sucesso!")
      setDeleteDialogOpen(false)
      setDeletingVisitor(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gestão de Visitantes</h1>
          <p className="text-muted-foreground">Acompanhe e gerencie os visitantes da sua igreja</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary">
          <Plus className="mr-2 h-4 w-4" />
          Novo Visitante
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total de Visitantes" value={String(totalVisitors)} icon={Users} color="gradient-primary" />
        <StatCard title="Novos este Mês" value={String(newThisMonth)} icon={UserPlus} color="bg-info" />
        <StatCard title="Convertidos" value={String(converted)} icon={UserCheck} color="bg-success" />
        <StatCard title="Acompanhando" value={String(following)} icon={Heart} color="bg-primary" />
      </div>

      <Card className="glass">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="contacted">Contactado</SelectItem>
                <SelectItem value="following">Acompanhando</SelectItem>
                <SelectItem value="converted">Convertido</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitante</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Visitas</TableHead>
                  <TableHead>Última Visita</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVisitors.map((visitor) => (
                  <TableRow key={visitor.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs gradient-primary text-white">
                            {visitor.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{visitor.name}</p>
                          <p className="text-xs text-muted-foreground">{visitor.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{visitor.phone}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {sourceLabels[visitor.source]}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[visitor.status]}>
                        {statusLabels[visitor.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {visitor.visitCount}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(parseISO(visitor.lastVisitDate), "dd MMM yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {visitor.assignedToName || "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {filteredVisitors.map((visitor) => (
              <div
                key={visitor.id}
                className="flex items-center gap-3 rounded-lg border border-border/30 p-3"
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="text-xs gradient-primary text-white">
                    {visitor.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{visitor.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{visitor.phone}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge className={statusColors[visitor.status]}>
                      {statusLabels[visitor.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {visitor.visitCount}
                    </span>
                  </div>
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
            ))}
          </div>

          {filteredVisitors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">Nenhum visitante encontrado</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingVisitor ? "Editar Visitante" : "Novo Visitante"}</DialogTitle>
            <DialogDescription>
              {editingVisitor ? "Atualize os dados do visitante" : "Cadastre um novo visitante na igreja"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome completo *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome do visitante"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="grid gap-2">
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Origem</Label>
                <Select
                  value={formData.source}
                  onValueChange={(v) => v && setFormData({ ...formData, source: v as Visitor["source"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="event">Evento</SelectItem>
                    <SelectItem value="cell">Célula</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="referral">Indicação</SelectItem>
                    <SelectItem value="walk-in">Espontâneo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => v && setFormData({ ...formData, status: v as Visitor["status"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Novo</SelectItem>
                    <SelectItem value="contacted">Contactado</SelectItem>
                    <SelectItem value="following">Acompanhando</SelectItem>
                    <SelectItem value="converted">Convertido</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Input
                value={formData.assignedTo}
                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>
            <div className="grid gap-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notas adicionais..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary">
              {editingVisitor ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir visitante</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingVisitor?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
