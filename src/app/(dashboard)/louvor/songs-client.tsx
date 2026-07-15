"use client"

import { FormEvent, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Edit, MoreVertical, Music, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteSong, saveSong } from "@/lib/pastoral/actions"
import type { PastoralListFilters, SongListItem, SongsListResult } from "@/lib/pastoral/types"
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

interface SongsClientProps {
  songsResult: SongsListResult
  filters: PastoralListFilters
}

interface SongFormState {
  id: string | null
  companyId: string | null
  title: string
  subtitle: string
  code: string
  author: string
  theme: string
  group: string
  tone: string
  rhythm: string
  content: string
  isActive: boolean
}

interface FilterState {
  search: string
  isActive: string
}

const emptyForm: SongFormState = {
  id: null,
  companyId: null,
  title: "",
  subtitle: "",
  code: "",
  author: "",
  theme: "",
  group: "",
  tone: "",
  rhythm: "",
  content: "",
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

function songToForm(song: SongListItem): SongFormState {
  return {
    id: song.id,
    companyId: song.companyId,
    title: song.title,
    subtitle: song.subtitle,
    code: song.code,
    author: song.author,
    theme: song.theme,
    group: song.group,
    tone: song.tone,
    rhythm: song.rhythm,
    content: song.content,
    isActive: song.isActive,
  }
}

export function SongsClient({ songsResult, filters }: SongsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const routePath = pathname ?? "/louvor"
  const songs = songsResult.items
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editingSong, setEditingSong] = useState<SongListItem | null>(null)
  const [deletingSong, setDeletingSong] = useState<SongListItem | null>(null)
  const [formData, setFormData] = useState<SongFormState>(emptyForm)
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
    setEditingSong(null)
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (song: SongListItem) => {
    setEditingSong(song)
    setFormData(songToForm(song))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast.error("Informe o título da música")
      return
    }

    setIsSaving(true)
    const result = await saveSong(formData)
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível salvar a música")
      return
    }

    toast.success(editingSong ? "Música atualizada com sucesso" : "Música cadastrada com sucesso")
    setDialogOpen(false)
    setEditingSong(null)
    setFormData(emptyForm)
    router.refresh()
  }

  const handleDelete = async () => {
    if (!deletingSong) return

    setIsDeleting(true)
    const result = await deleteSong({
      id: deletingSong.id,
      companyId: deletingSong.companyId,
    })
    setIsDeleting(false)

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível excluir a música")
      return
    }

    toast.success("Música removida com sucesso")
    setDeleteDialogOpen(false)
    setDeletingSong(null)
    router.refresh()
  }

  const goToPage = (page: number) => updateRoute(filterState, page)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Louvor</h1>
          <p className="text-muted-foreground">Gerencie repertório, letras e informações musicais no banco.</p>
        </div>
        <Button onClick={openCreateDialog} className="gradient-primary w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova Música
        </Button>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, autor ou tema"
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
            <SelectItem value="yes">Ativas</SelectItem>
            <SelectItem value="no">Inativas</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {songs.map((song) => (
          <Card key={song.id} className="glass group">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle className="truncate text-base">{song.title}</CardTitle>
                  <p className="truncate text-sm text-muted-foreground">{song.subtitle || song.author || "Sem subtítulo"}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
                    <MoreVertical className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEditDialog(song)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setDeletingSong(song)
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
              <div className="flex flex-wrap gap-2">
                <Badge
                  className={
                    song.isActive
                      ? "bg-success/10 text-success border-success/20"
                      : "bg-destructive/10 text-destructive border-destructive/20"
                  }
                >
                  {song.isActive ? "Ativa" : "Inativa"}
                </Badge>
                {song.theme && <Badge variant="secondary">{song.theme}</Badge>}
                {song.tone && <Badge variant="outline">Tom {song.tone}</Badge>}
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {song.content || "Letra ou observações ainda não cadastradas."}
              </p>
              <p className="text-xs text-muted-foreground">Atualizada em {formatDate(song.updatedAt)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {songs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Music className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma música encontrada</p>
        </div>
      )}

      {songsResult.total > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {songsResult.page} de {songsResult.pageCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={songsResult.page <= 1}
              onClick={() => goToPage(songsResult.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={songsResult.page >= songsResult.pageCount}
              onClick={() => goToPage(songsResult.page + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-strong max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSong ? "Editar Música" : "Nova Música"}</DialogTitle>
            <DialogDescription>
              {editingSong ? "Atualize o repertório persistido." : "Cadastre uma música real para o repertório."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                placeholder="Título da música"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Subtítulo</Label>
                <Input
                  value={formData.subtitle}
                  onChange={(event) => setFormData({ ...formData, subtitle: event.target.value })}
                  placeholder="Subtítulo"
                />
              </div>
              <div className="grid gap-2">
                <Label>Código</Label>
                <Input
                  value={formData.code}
                  onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                  placeholder="Código interno"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Autor</Label>
                <Input
                  value={formData.author}
                  onChange={(event) => setFormData({ ...formData, author: event.target.value })}
                  placeholder="Autor"
                />
              </div>
              <div className="grid gap-2">
                <Label>Tema</Label>
                <Input
                  value={formData.theme}
                  onChange={(event) => setFormData({ ...formData, theme: event.target.value })}
                  placeholder="Adoração, comunhão, envio..."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Grupo</Label>
                <Input
                  value={formData.group}
                  onChange={(event) => setFormData({ ...formData, group: event.target.value })}
                  placeholder="Equipe ou repertório"
                />
              </div>
              <div className="grid gap-2">
                <Label>Tom</Label>
                <Input
                  value={formData.tone}
                  onChange={(event) => setFormData({ ...formData, tone: event.target.value })}
                  placeholder="G, C, D"
                />
              </div>
              <div className="grid gap-2">
                <Label>Ritmo</Label>
                <Input
                  value={formData.rhythm}
                  onChange={(event) => setFormData({ ...formData, rhythm: event.target.value })}
                  placeholder="Balada, pop, congregacional"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Letra ou observações</Label>
              <Textarea
                value={formData.content}
                onChange={(event) => setFormData({ ...formData, content: event.target.value })}
                placeholder="Letra, cifra ou observações"
                rows={6}
              />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving}>
              {isSaving ? "Salvando..." : editingSong ? "Salvar alterações" : "Criar música"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir música</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingSong?.title}</strong>? O registro será removido da operação ativa.
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
