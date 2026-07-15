"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ClipboardList,
  Copy,
  ExternalLink,
  MoreVertical,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { deleteForm, saveForm } from "@/lib/forms/actions"
import type { ChurchForm, FormStatus, FormsDashboardData } from "@/lib/forms/types"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface FormsClientProps {
  data: FormsDashboardData
}

const statusLabels: Record<FormStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
}

const statusVariant: Record<FormStatus, "secondary" | "default" | "outline"> = {
  draft: "secondary",
  published: "default",
  archived: "outline",
}

function slugifyPreview(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

export function FormsClient({ data }: FormsClientProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChurchForm | null>(null)
  const [title, setTitle] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [targetStageId, setTargetStageId] = useState(data.stages[0]?.id ?? "")
  const [status, setStatus] = useState<FormStatus>("draft")

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return data.forms
    return data.forms.filter(
      (form) =>
        form.title.toLowerCase().includes(term) ||
        form.slug.toLowerCase().includes(term) ||
        (form.targetStageName || "").toLowerCase().includes(term)
    )
  }, [data.forms, search])

  function openCreate() {
    setTitle("")
    setSlug("")
    setDescription("")
    setTargetStageId(data.stages[0]?.id ?? "")
    setStatus("draft")
    setCreateOpen(true)
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveForm({
        companyId: data.companyId,
        title,
        slug: slug || slugifyPreview(title),
        description,
        status,
        targetStageId: targetStageId || null,
        createPerson: true,
        isActive: true,
      })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível criar o formulário")
        return
      }
      toast.success("Formulário criado")
      setCreateOpen(false)
      if (result.id) {
        router.push(`/formularios/${result.id}`)
      } else {
        router.refresh()
      }
    })
  }

  function handleDelete() {
    if (!deleteTarget) return
    startTransition(async () => {
      const result = await deleteForm({ id: deleteTarget.id, companyId: data.companyId })
      if (!result.ok) {
        toast.error(result.error || "Não foi possível excluir")
        return
      }
      toast.success("Formulário excluído")
      setDeleteTarget(null)
      router.refresh()
    })
  }

  async function copyLink(form: ChurchForm) {
    const path = form.publicUrl || `/f/${data.companySlug}/${form.slug}`
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado")
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formulários"
        description="Crie formulários públicos e direcione as respostas para o Kanban."
      >
        <Button type="button" className="gradient-primary" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo formulário
        </Button>
      </PageHeader>

      <Card className="glass">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Seus formulários</CardTitle>
              <CardDescription>
                {data.forms.length} formulário(s) · destino no CRM / Kanban
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9 md:pl-9"
                placeholder="Buscar por título ou slug..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={data.forms.length === 0 ? "Nenhum formulário ainda" : "Nenhum resultado"}
              description={
                data.forms.length === 0
                  ? "Crie o primeiro formulário de contato, visitante ou inscrição."
                  : "Tente outro termo de busca."
              }
              action={
                data.forms.length === 0 ? (
                  <Button type="button" onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar formulário
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3">
              {filtered.map((form) => (
                <div
                  key={form.id}
                  className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/formularios/${form.id}`}
                        className="truncate font-semibold hover:text-primary"
                      >
                        {form.title}
                      </Link>
                      <Badge variant={statusVariant[form.status]}>{statusLabels[form.status]}</Badge>
                      {!form.isActive ? <Badge variant="outline">Inativo</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      /f/{data.companySlug}/{form.slug}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{form.fieldCount ?? 0} campos</span>
                      <span>{form.submissionCount ?? 0} envios</span>
                      <span>
                        Kanban: {form.targetStageName || "coluna padrão"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/formularios/${form.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Editar
                    </Link>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => copyLink(form)}
                      title="Copiar link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {form.status === "published" ? (
                      <Link
                        href={`/f/${data.companySlug}/${form.slug}`}
                        target="_blank"
                        title="Abrir público"
                        className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button type="button" variant="ghost" size="icon" className="h-8 w-8" />}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDeleteTarget(form)}>
                          <Trash2 className="mr-2 h-3.5 w-3.5 text-destructive" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo formulário</DialogTitle>
            <DialogDescription>
              Você poderá adicionar campos e ajustar o layout logo em seguida.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(event) => {
                  const next = event.target.value
                  setTitle(next)
                  if (!slug || slug === slugifyPreview(title)) {
                    setSlug(slugifyPreview(next))
                  }
                }}
                placeholder="Ex: Formulário de visitante"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug amigável</Label>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-muted-foreground">/f/{data.companySlug}/</span>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(event) => setSlug(slugifyPreview(event.target.value))}
                  placeholder="visitante"
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Texto de boas-vindas exibido na página pública"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Coluna no Kanban</Label>
                <Select
                  value={targetStageId || "__default__"}
                  onValueChange={(value) =>
                    setTargetStageId(!value || value === "__default__" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Coluna padrão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Coluna padrão do CRM</SelectItem>
                    {data.stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(value) => setStatus((value as FormStatus) || "draft")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="gradient-primary" disabled={pending}>
                Criar e editar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O formulário deixará de ficar disponível publicamente. Os envios anteriores permanecem no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={pending}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
