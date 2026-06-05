"use client"

import { FormEvent, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  BookOpen,
  Edit,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  MoreVertical,
  Newspaper,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteContentBanner,
  deleteContentPost,
  saveContentBanner,
  saveContentPost,
  uploadContentAsset,
} from "./actions"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type {
  ContentBanner,
  ContentCategory,
  ContentDashboardData,
  ContentPost,
  ContentStatus,
  ContentType,
} from "@/lib/content/types"

type PostFormState = {
  id: string | null
  companyId: string | null
  categoryId: string
  type: ContentType
  title: string
  slug: string
  summary: string
  content: string
  authorName: string
  embedUrl: string
  coverFileId: string | null
  coverFileName: string
  coverImageUrl: string
  status: ContentStatus
  scheduledPublishAt: string
  sendPushNotification: boolean
}

type BannerFormState = {
  id: string | null
  companyId: string | null
  title: string
  imageFileId: string | null
  imageFileName: string
  imageUrl: string
  linkUrl: string
  sortOrder: number
  startsAt: string
  endsAt: string
  isActive: boolean
  showInApps: boolean
  showInWeb: boolean
}

type ContentAssetTarget = "content-cover" | "banner-image"

interface ContentClientProps {
  data: ContentDashboardData
}

const typeLabels: Record<ContentType, string> = {
  news: "Notícias",
  devotional: "Devocionais",
  ebd: "EBD",
  publication: "Publicações",
}

const typeIcons: Record<ContentType, React.ElementType> = {
  news: Newspaper,
  devotional: BookOpen,
  ebd: GraduationCap,
  publication: FileText,
}

const statusLabels: Record<ContentStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
}

const emptyPostForm: PostFormState = {
  id: null,
  companyId: null,
  categoryId: "none",
  type: "news",
  title: "",
  slug: "",
  summary: "",
  content: "",
  authorName: "",
  embedUrl: "",
  coverFileId: null,
  coverFileName: "",
  coverImageUrl: "",
  status: "draft",
  scheduledPublishAt: "",
  sendPushNotification: false,
}

const emptyBannerForm: BannerFormState = {
  id: null,
  companyId: null,
  title: "",
  imageFileId: null,
  imageFileName: "",
  imageUrl: "",
  linkUrl: "",
  sortOrder: 0,
  startsAt: "",
  endsAt: "",
  isActive: true,
  showInApps: true,
  showInWeb: true,
}

function formatDate(value: string | null) {
  if (!value) return "-"
  return format(parseISO(value), "dd/MM/yyyy HH:mm", { locale: ptBR })
}

function toDateTimeLocal(value: string | null) {
  if (!value) return ""
  return value.slice(0, 16)
}

function postToForm(post: ContentPost): PostFormState {
  return {
    id: post.id,
    companyId: post.companyId,
    categoryId: post.categoryId ?? "none",
    type: post.type,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    content: post.content,
    authorName: post.authorName,
    embedUrl: post.embedUrl,
    coverFileId: post.coverFileId,
    coverFileName: post.coverFileName,
    coverImageUrl: post.coverImageUrl,
    status: post.status,
    scheduledPublishAt: toDateTimeLocal(post.scheduledPublishAt),
    sendPushNotification: post.sendPushNotification,
  }
}

function bannerToForm(banner: ContentBanner): BannerFormState {
  return {
    id: banner.id,
    companyId: banner.companyId,
    title: banner.title,
    imageFileId: banner.imageFileId,
    imageFileName: banner.imageFileName,
    imageUrl: banner.imageUrl,
    linkUrl: banner.linkUrl,
    sortOrder: banner.sortOrder,
    startsAt: toDateTimeLocal(banner.startsAt),
    endsAt: toDateTimeLocal(banner.endsAt),
    isActive: banner.isActive,
    showInApps: banner.showInApps,
    showInWeb: banner.showInWeb,
  }
}

function StatusBadge({ status }: { status: ContentStatus }) {
  if (status === "published") {
    return <Badge className="border-success/20 bg-success/10 text-success">Publicado</Badge>
  }
  if (status === "archived") {
    return <Badge variant="outline">Arquivado</Badge>
  }
  return <Badge variant="secondary">Rascunho</Badge>
}

function TypeMetric({ type, total }: { type: ContentType; total: number }) {
  const Icon = typeIcons[type]
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{typeLabels[type]}</p>
          <p className="text-2xl font-bold">{total}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function categoriesForType(categories: ContentCategory[], type: ContentType) {
  return categories.filter((category) => !category.contentType || category.contentType === type)
}

export function ContentClient({ data }: ContentClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [activeType, setActiveType] = useState<ContentType>("news")
  const [search, setSearch] = useState("")
  const [postDialogOpen, setPostDialogOpen] = useState(false)
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false)
  const [postForm, setPostForm] = useState<PostFormState>(emptyPostForm)
  const [bannerForm, setBannerForm] = useState<BannerFormState>(emptyBannerForm)

  const postsByType = useMemo(() => {
    return data.posts.filter((post) => post.type === activeType)
  }, [activeType, data.posts])

  const filteredPosts = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return postsByType
    return postsByType.filter((post) =>
      [post.title, post.summary, post.authorName, post.categoryName ?? ""].some((value) =>
        value.toLowerCase().includes(term)
      )
    )
  }, [postsByType, search])

  const metrics = useMemo(() => {
    return (Object.keys(typeLabels) as ContentType[]).map((type) => ({
      type,
      total: data.posts.filter((post) => post.type === type).length,
    }))
  }, [data.posts])

  function openNewPost(type: ContentType) {
    setPostForm({ ...emptyPostForm, type })
    setPostDialogOpen(true)
  }

  function openEditPost(post: ContentPost) {
    setPostForm(postToForm(post))
    setPostDialogOpen(true)
  }

  function openNewBanner() {
    setBannerForm(emptyBannerForm)
    setBannerDialogOpen(true)
  }

  function openEditBanner(banner: ContentBanner) {
    setBannerForm(bannerToForm(banner))
    setBannerDialogOpen(true)
  }

  function refreshAfterSuccess(message: string) {
    toast.success(message)
    router.refresh()
  }

  function uploadAsset(target: ContentAssetTarget, file: File | null) {
    if (!file) return

    startTransition(async () => {
      const source = target === "content-cover" ? postForm : bannerForm
      const payload = new FormData()
      payload.set("target", target)
      if (source.companyId) {
        payload.set("companyId", source.companyId)
      }
      if (source.id) {
        payload.set("entityId", source.id)
      }
      payload.set("file", file)

      const result = await uploadContentAsset(payload)
      if (!result.ok || !result.id) {
        toast.error(result.error ?? "Não foi possível enviar o arquivo")
        return
      }

      if (target === "content-cover") {
        setPostForm((current) => ({
          ...current,
          coverFileId: result.id ?? null,
          coverFileName: result.originalName ?? file.name,
        }))
      } else {
        setBannerForm((current) => ({
          ...current,
          imageFileId: result.id ?? null,
          imageFileName: result.originalName ?? file.name,
        }))
      }
      toast.success("Arquivo enviado")
    })
  }

  function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveContentPost({
        ...postForm,
        categoryId: postForm.categoryId === "none" ? null : postForm.categoryId,
        scheduledPublishAt: postForm.scheduledPublishAt || null,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar")
        return
      }
      setPostDialogOpen(false)
      refreshAfterSuccess(postForm.status === "published" ? "Conteúdo publicado" : "Conteúdo salvo")
    })
  }

  function submitBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveContentBanner({
        ...bannerForm,
        startsAt: bannerForm.startsAt || null,
        endsAt: bannerForm.endsAt || null,
      })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar")
        return
      }
      setBannerDialogOpen(false)
      refreshAfterSuccess("Banner salvo")
    })
  }

  function removePost(post: ContentPost) {
    startTransition(async () => {
      const result = await deleteContentPost({ id: post.id, companyId: post.companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir")
        return
      }
      refreshAfterSuccess("Conteúdo excluído")
    })
  }

  function removeBanner(banner: ContentBanner) {
    startTransition(async () => {
      const result = await deleteContentBanner({ id: banner.id, companyId: banner.companyId })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível excluir")
        return
      }
      refreshAfterSuccess("Banner excluído")
    })
  }

  const activeCategories = categoriesForType(data.categories, postForm.type)
  const selectedCategoryLabel =
    postForm.categoryId === "none"
      ? "Sem categoria"
      : activeCategories.find((category) => category.id === postForm.categoryId)?.name ?? "Sem categoria"

  return (
    <div className="space-y-6">
      <PageHeader title="Conteúdo" description="Gerencie publicações, devocionais, EBDs e banners com persistência real.">
        <Button onClick={() => openNewPost(activeType)} className="gradient-primary">
          <Plus className="mr-2 h-4 w-4" />
          Novo conteúdo
        </Button>
        <Button variant="outline" onClick={openNewBanner}>
          <ImageIcon className="mr-2 h-4 w-4" />
          Novo banner
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <TypeMetric key={metric.type} type={metric.type} total={metric.total} />
        ))}
      </div>

      <Tabs value={activeType} onValueChange={(value) => setActiveType(value as ContentType)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:grid-cols-4">
            {(Object.keys(typeLabels) as ContentType[]).map((type) => (
              <TabsTrigger key={type} value={type}>
                {typeLabels[type]}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="relative w-full lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Buscar por título, autor ou categoria"
            />
          </div>
        </div>

        {(Object.keys(typeLabels) as ContentType[]).map((type) => (
          <TabsContent key={type} value={type} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{typeLabels[type]}</CardTitle>
                <CardDescription>{filteredPosts.length} itens encontrados</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredPosts.length === 0 ? (
                  <EmptyState
                    icon={typeIcons[type]}
                    title="Nenhum conteúdo encontrado"
                    description="Crie o primeiro item deste tipo para publicar no portal da igreja."
                    action={
                      <Button onClick={() => openNewPost(type)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar conteúdo
                      </Button>
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Título</TableHead>
                          <TableHead>Categoria</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Publicação</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPosts.map((post) => (
                          <TableRow key={post.id}>
                            <TableCell>
                              <div className="max-w-xl">
                                <p className="font-medium">{post.title}</p>
                                <p className="line-clamp-1 text-sm text-muted-foreground">{post.summary || post.slug}</p>
                              </div>
                            </TableCell>
                            <TableCell>{post.categoryName ?? "-"}</TableCell>
                            <TableCell>
                              <StatusBadge status={post.status} />
                            </TableCell>
                            <TableCell>{formatDate(post.publishedAt ?? post.scheduledPublishAt)}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  disabled={isPending}
                                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditPost(post)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => removePost(post)}>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Banners</CardTitle>
          <CardDescription>Controle de exibição no portal público e aplicativos.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.banners.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="Nenhum banner cadastrado"
              description="Crie banners para destacar campanhas e chamadas no portal público."
              action={
                <Button onClick={openNewBanner}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar banner
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.banners.map((banner) => (
                    <TableRow key={banner.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{banner.title}</p>
                          <p className="text-sm text-muted-foreground">{banner.linkUrl || "Sem link"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{banner.sortOrder}</TableCell>
                      <TableCell>{formatDate(banner.startsAt)} até {formatDate(banner.endsAt)}</TableCell>
                      <TableCell>
                        {banner.isActive ? <Badge className="border-success/20 bg-success/10 text-success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            disabled={isPending}
                            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditBanner(banner)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => removeBanner(banner)}>
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
          )}
        </CardContent>
      </Card>

      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={submitPost} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{postForm.id ? "Editar conteúdo" : "Novo conteúdo"}</DialogTitle>
              <DialogDescription>Os dados salvos aqui alimentam o painel e o portal público.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={postForm.type} onValueChange={(value) => setPostForm({ ...postForm, type: value as ContentType, categoryId: "none" })}>
                  <SelectTrigger>
                    <SelectValue>{typeLabels[postForm.type]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(typeLabels) as ContentType[]).map((type) => (
                      <SelectItem key={type} value={type}>{typeLabels[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={postForm.categoryId} onValueChange={(value) => setPostForm({ ...postForm, categoryId: value ?? "none" })}>
                  <SelectTrigger>
                    <SelectValue>{selectedCategoryLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {activeCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input value={postForm.title} onChange={(event) => setPostForm({ ...postForm, title: event.target.value })} required />
            </div>

            <div className="grid gap-2">
              <Label>Resumo</Label>
              <Textarea value={postForm.summary} onChange={(event) => setPostForm({ ...postForm, summary: event.target.value })} rows={3} />
            </div>

            <div className="grid gap-2">
              <Label>Conteúdo *</Label>
              <Textarea value={postForm.content} onChange={(event) => setPostForm({ ...postForm, content: event.target.value })} rows={8} required />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Autor</Label>
                <Input value={postForm.authorName} onChange={(event) => setPostForm({ ...postForm, authorName: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>URL externa</Label>
                <Input value={postForm.embedUrl} onChange={(event) => setPostForm({ ...postForm, embedUrl: event.target.value })} placeholder="https://..." />
              </div>
              <div className="grid gap-2">
                <Label>Slug</Label>
                <Input value={postForm.slug} onChange={(event) => setPostForm({ ...postForm, slug: event.target.value })} placeholder="gerado pelo título se vazio" />
              </div>
              <div className="grid gap-2">
                <Label>Imagem de capa</Label>
                <Input value={postForm.coverImageUrl} onChange={(event) => setPostForm({ ...postForm, coverImageUrl: event.target.value })} placeholder="URL pública opcional" />
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Upload da capa
                </Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={isPending}
                  onChange={(event) => uploadAsset("content-cover", event.currentTarget.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  {postForm.coverFileName ? `Arquivo atual: ${postForm.coverFileName}` : "Opcional, substitui a URL pública no portal"}
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={postForm.status} onValueChange={(value) => setPostForm({ ...postForm, status: value as ContentStatus })}>
                  <SelectTrigger>
                    <SelectValue>{statusLabels[postForm.status]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Agendar publicação</Label>
                <Input type="datetime-local" value={postForm.scheduledPublishAt} onChange={(event) => setPostForm({ ...postForm, scheduledPublishAt: event.target.value })} />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Enviar push quando publicar</Label>
                <p className="text-sm text-muted-foreground">O envio fica auditado e preparado para gateway futuro.</p>
              </div>
              <Switch checked={postForm.sendPushNotification} onCheckedChange={(checked) => setPostForm({ ...postForm, sendPushNotification: checked })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPostDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="gradient-primary">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bannerDialogOpen} onOpenChange={setBannerDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <form onSubmit={submitBanner} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{bannerForm.id ? "Editar banner" : "Novo banner"}</DialogTitle>
              <DialogDescription>Use banners para chamadas rápidas no portal público.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2">
              <Label>Título *</Label>
              <Input value={bannerForm.title} onChange={(event) => setBannerForm({ ...bannerForm, title: event.target.value })} required />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Imagem</Label>
                <Input value={bannerForm.imageUrl} onChange={(event) => setBannerForm({ ...bannerForm, imageUrl: event.target.value })} placeholder="URL pública opcional" />
              </div>
              <div className="grid gap-2">
                <Label>Link</Label>
                <Input value={bannerForm.linkUrl} onChange={(event) => setBannerForm({ ...bannerForm, linkUrl: event.target.value })} placeholder="/login ou https://..." />
              </div>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-primary" />
                  Upload do banner
                </Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={isPending}
                  onChange={(event) => uploadAsset("banner-image", event.currentTarget.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  {bannerForm.imageFileName ? `Arquivo atual: ${bannerForm.imageFileName}` : "Opcional, substitui a URL pública no portal"}
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Ordem</Label>
                <Input type="number" min={0} value={bannerForm.sortOrder} onChange={(event) => setBannerForm({ ...bannerForm, sortOrder: Number(event.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Início</Label>
                <Input type="datetime-local" value={bannerForm.startsAt} onChange={(event) => setBannerForm({ ...bannerForm, startsAt: event.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Fim</Label>
                <Input type="datetime-local" value={bannerForm.endsAt} onChange={(event) => setBannerForm({ ...bannerForm, endsAt: event.target.value })} />
              </div>
            </div>

            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Ativo</span>
                <Switch checked={bannerForm.isActive} onCheckedChange={(checked) => setBannerForm({ ...bannerForm, isActive: checked })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Portal web</span>
                <Switch checked={bannerForm.showInWeb} onCheckedChange={(checked) => setBannerForm({ ...bannerForm, showInWeb: checked })} />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Aplicativos</span>
                <Switch checked={bannerForm.showInApps} onCheckedChange={(checked) => setBannerForm({ ...bannerForm, showInApps: checked })} />
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBannerDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending} className="gradient-primary">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
