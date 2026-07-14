"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Plus, Search, MoreVertical, Edit, Trash2, Megaphone, Send, Eye, EyeOff } from "lucide-react"
import { mockAnnouncements } from "@/lib/mock/data"
import type { Announcement } from "@/lib/types"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const priorityColors = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-info/10 text-info border-info/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
}

const priorityLabels = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
}

export default function CommunicationPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>(mockAnnouncements)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null)
  const [deletingAnn, setDeletingAnn] = useState<Announcement | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    priority: "medium" as Announcement["priority"],
    published: false,
  })

  const filteredAnns = announcements.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.content.toLowerCase().includes(search.toLowerCase())
  )

  const resetForm = () => {
    setFormData({ title: "", content: "", priority: "medium", published: false })
    setEditingAnn(null)
  }

  const openCreateDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (ann: Announcement) => {
    setEditingAnn(ann)
    setFormData({
      title: ann.title,
      content: ann.content,
      priority: ann.priority,
      published: ann.published,
    })
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.title || !formData.content) {
      toast.error("Preencha os campos obrigatórios")
      return
    }

    if (editingAnn) {
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === editingAnn.id
            ? {
                ...a,
                ...formData,
                publishedAt: formData.published && !a.publishedAt ? new Date().toISOString().split("T")[0] : a.publishedAt,
              }
            : a
        )
      )
      toast.success("Aviso atualizado!")
    } else {
      const newAnn: Announcement = {
        id: `a${Date.now()}`,
        churchId: "c1",
        ...formData,
        authorId: "u2",
        authorName: "Pastor João Silva",
        publishedAt: formData.published ? new Date().toISOString().split("T")[0] : undefined,
        createdAt: new Date().toISOString().split("T")[0],
      }
      setAnnouncements((prev) => [newAnn, ...prev])
      toast.success("Aviso criado!")
    }
    setDialogOpen(false)
    resetForm()
  }

  const handleDelete = () => {
    if (deletingAnn) {
      setAnnouncements((prev) => prev.filter((a) => a.id !== deletingAnn.id))
      toast.success("Aviso removido!")
      setDeleteDialogOpen(false)
      setDeletingAnn(null)
    }
  }

  const togglePublish = (ann: Announcement) => {
    setAnnouncements((prev) =>
      prev.map((a) =>
        a.id === ann.id
          ? {
              ...a,
              published: !a.published,
              publishedAt: !a.published ? new Date().toISOString().split("T")[0] : a.publishedAt,
            }
          : a
      )
    )
    toast.success(ann.published ? "Aviso despublicado" : "Aviso publicado!")
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Comunicação</h1>
          <p className="text-muted-foreground">Avisos e comunicados da igreja</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary">
          <Plus className="mr-2 h-4 w-4" />
          Novo Aviso
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar avisos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-4">
        {filteredAnns.map((ann) => (
          <Card key={ann.id} className="glass overflow-hidden group">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{ann.title}</h3>
                    <Badge className={priorityColors[ann.priority]}>{priorityLabels[ann.priority]}</Badge>
                    <Badge variant={ann.published ? "default" : "secondary"} className="text-xs">
                      {ann.published ? (
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> Publicado</span>
                      ) : (
                        <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Rascunho</span>
                      )}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{ann.content}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Por {ann.authorName}</span>
                    <span>{format(parseISO(ann.createdAt), "dd MMM yyyy", { locale: ptBR })}</span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" />}>
                      <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(ann)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => togglePublish(ann)}>
                      {ann.published ? <EyeOff className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                      {ann.published ? "Despublicar" : "Publicar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingAnn(ann)
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
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAnns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Megaphone className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhum aviso encontrado</p>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingAnn ? "Editar Aviso" : "Novo Aviso"}</DialogTitle>
            <DialogDescription>
              {editingAnn ? "Atualize o aviso" : "Crie um novo aviso para a igreja"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Título do aviso"
              />
            </div>
            <div className="grid gap-2">
              <Label>Conteúdo *</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Conteúdo do aviso..."
                rows={5}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Prioridade</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData({ ...formData, priority: v as Announcement["priority"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.published ? "published" : "draft"}
                  onValueChange={(v) => setFormData({ ...formData, published: v === "published" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary">
              {editingAnn ? "Salvar alterações" : "Criar aviso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aviso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingAnn?.title}</strong>?
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
