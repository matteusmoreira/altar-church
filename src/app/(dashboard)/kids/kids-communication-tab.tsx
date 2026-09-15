"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  ChevronUp,
  Grid2X2,
  List,
  Mail,
  Megaphone,
  MessageSquare,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { EmptyState } from "@/components/shared"
import {
  deleteKidConversation,
  deleteKidMessage,
  loadKidsCommunicationData,
  markKidConversationRead,
  sendKidCampaign,
  sendKidInternalMessage,
} from "@/lib/kids/actions"
import type { KidsCommunicationData } from "@/lib/kids/types"
import { createClient } from "@/lib/supabase/client"

function showResult(result: { ok: boolean; error?: string }) {
  if (!result.ok) toast.error(result.error ?? "Não foi possível concluir")
  return result.ok
}

function formatDateTime(value: string) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

type SegmentKind = "all" | "congregation" | "classroom" | "age" | "kid"

function getStatusBadge(status: string) {
  switch (status) {
    case "queued":
      return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Na fila</Badge>
    case "sent":
      return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Enviada</Badge>
    case "delivered":
      return <Badge variant="default" className="bg-emerald-600 text-white">Entregue</Badge>
    case "failed":
      return <Badge variant="destructive">Falha</Badge>
    case "cancelled":
      return <Badge variant="destructive">Cancelada</Badge>
    case "draft":
      return <Badge variant="outline">Rascunho</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

function getChannelBadge(channel: "whatsapp" | "email" | "internal") {
  switch (channel) {
    case "whatsapp":
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
          <MessageSquare className="h-3 w-3" />
          <span>WhatsApp</span>
        </Badge>
      )
    case "email":
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-sky-500/30 text-sky-600 dark:text-sky-400 bg-sky-500/5">
          <Mail className="h-3 w-3" />
          <span>E-mail</span>
        </Badge>
      )
    case "internal":
      return (
        <Badge variant="outline" className="flex items-center gap-1 border-purple-500/30 text-purple-600 dark:text-purple-400 bg-purple-500/5">
          <MessageSquare className="h-3 w-3" />
          <span>Chat interno</span>
        </Badge>
      )
  }
}

export function KidsCommunicationTab({ data: initialData }: { data: KidsCommunicationData }) {
  const [data, setData] = useState(initialData)
  const [isFormOpen, setIsFormOpen] = useState(true)
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [channelFilter, setChannelFilter] = useState<"all" | "whatsapp" | "email" | "internal">("all")
  const [searchQuery, setSearchQuery] = useState("")

  const [channel, setChannel] = useState<"whatsapp" | "email" | "internal">("whatsapp")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [segmentKind, setSegmentKind] = useState<SegmentKind>("all")
  const [congregationId, setCongregationId] = useState("")
  const [classroomId, setClassroomId] = useState("")
  const [minAge, setMinAge] = useState("")
  const [maxAge, setMaxAge] = useState("")
  const [kidId, setKidId] = useState("")
  const [pending, setPending] = useState(false)
  const [guardianPersonId, setGuardianPersonId] = useState("")
  const [conversationId, setConversationId] = useState("")

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; kind: "message" | "conversation"; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const subscription = supabase
      .channel("kids-chat-staff")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "kid_conversation_messages" }, () => {
        void loadKidsCommunicationData().then((result) => {
          if (result.ok && result.data) setData(result.data)
        })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(subscription)
    }
  }, [])

  async function submit() {
    setPending(true)
    try {
      if (channel === "internal") {
        const result = await sendKidInternalMessage({
          conversationId: conversationId || null,
          guardianPersonId: guardianPersonId || null,
          kidId: segmentKind === "kid" ? kidId || null : null,
          body,
        })
        if (showResult(result)) {
          toast.success("Mensagem enviada no chat interno")
          setBody("")
          if (result.id) setConversationId(result.id)
          const refreshed = await loadKidsCommunicationData()
          if (refreshed.ok && refreshed.data) setData(refreshed.data)
        }
        return
      }
      const result = await sendKidCampaign({
        channel,
        subject,
        body,
        congregationId: segmentKind === "congregation" ? congregationId || null : null,
        classroomId: segmentKind === "classroom" ? classroomId || null : null,
        minAgeMonths: segmentKind === "age" && minAge !== "" ? Number(minAge) : null,
        maxAgeMonths: segmentKind === "age" && maxAge !== "" ? Number(maxAge) : null,
        kidId: segmentKind === "kid" ? kidId || null : null,
      })
      if (showResult(result)) {
        toast.success("Campanha enfileirada. Entregas seguem preferências e consentimentos.")
        setBody("")
        setSubject("")
        const refreshed = await loadKidsCommunicationData()
        if (refreshed.ok && refreshed.data) setData(refreshed.data)
      }
    } finally {
      setPending(false)
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setIsDeleting(true)
    try {
      if (deleteConfirm.kind === "message") {
        const res = await deleteKidMessage(deleteConfirm.id)
        if (showResult(res)) {
          toast.success("Card de comunicação excluído com sucesso")
          setData((prev) => ({
            ...prev,
            messages: prev.messages.filter((m) => m.id !== deleteConfirm.id),
          }))
        }
      } else {
        const res = await deleteKidConversation(deleteConfirm.id)
        if (showResult(res)) {
          toast.success("Conversa excluída com sucesso")
          setData((prev) => ({
            ...prev,
            conversations: prev.conversations.filter((c) => c.id !== deleteConfirm.id),
          }))
        }
      }
      setDeleteConfirm(null)
    } finally {
      setIsDeleting(false)
    }
  }

  const query = searchQuery.trim().toLowerCase()

  const filteredMessages = data.messages.filter((message) => {
    if (channelFilter !== "all" && message.channel !== channelFilter) return false
    if (!query) return true
    return (
      (message.subject && message.subject.toLowerCase().includes(query)) ||
      (message.body && message.body.toLowerCase().includes(query)) ||
      (message.createdByName && message.createdByName.toLowerCase().includes(query)) ||
      message.status.toLowerCase().includes(query)
    )
  })

  const filteredConversations = data.conversations.filter((conversation) => {
    if (channelFilter !== "all" && channelFilter !== "internal") return false
    if (!query) return true
    return (
      (conversation.guardianName && conversation.guardianName.toLowerCase().includes(query)) ||
      (conversation.childName && conversation.childName.toLowerCase().includes(query)) ||
      conversation.messages.some((m) => m.body.toLowerCase().includes(query) || m.senderName.toLowerCase().includes(query))
    )
  })

  const totalFilteredCount = filteredMessages.length + filteredConversations.length

  return (
    <div className="space-y-6">
      {/* Seção Nova Comunicação (Colapsável / 1 Coluna) */}
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="h-5 w-5 text-primary" />
              Nova comunicação
            </CardTitle>
            <CardDescription>
              Campanhas externas respeitam consentimentos. O chat interno é direto e fica disponível no Portal da Família.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="shrink-0 gap-1.5"
            aria-label={isFormOpen ? "Recolher formulário" : "Expandir formulário"}
          >
            {isFormOpen ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Recolher
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Nova comunicação
              </>
            )}
          </Button>
        </CardHeader>

        {isFormOpen && (
          <CardContent className="space-y-4 border-t border-border/50 pt-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Canal de envio</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as "whatsapp" | "email" | "internal")}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="internal">Chat interno</option>
                </select>
              </div>

              {channel !== "internal" ? (
                <div className="space-y-1.5">
                  <Label>Segmento</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    value={segmentKind}
                    onChange={(event) => setSegmentKind(event.target.value as SegmentKind)}
                  >
                    <option value="all">Todos os responsáveis</option>
                    <option value="congregation">Por congregação</option>
                    <option value="classroom">Por sala (presença recente)</option>
                    <option value="age">Por faixa etária</option>
                    <option value="kid">Família específica (uma criança)</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5 lg:col-span-2">
                  <Label>Responsável destinatário *</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    value={guardianPersonId}
                    onChange={(event) => {
                      setGuardianPersonId(event.target.value)
                      const existing = data.conversations.find((item) => item.guardianPersonId === event.target.value)
                      setConversationId(existing?.id ?? "")
                    }}
                  >
                    <option value="">Escolha o responsável…</option>
                    {data.guardians.map((guardian) => (
                      <option key={guardian.personId} value={guardian.personId}>
                        {guardian.fullName} · {guardian.children.join(", ")}
                        {guardian.portalActive ? "" : " · portal ainda não ativado"}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channel !== "internal" && segmentKind === "congregation" && (
                <div className="space-y-1.5">
                  <Label>Congregação *</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    value={congregationId}
                    onChange={(event) => setCongregationId(event.target.value)}
                  >
                    <option value="">Escolha a congregação…</option>
                    {data.congregations.map((congregation) => (
                      <option key={congregation.id} value={congregation.id}>
                        {congregation.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channel !== "internal" && segmentKind === "classroom" && (
                <div className="space-y-1.5">
                  <Label>Sala *</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    value={classroomId}
                    onChange={(event) => setClassroomId(event.target.value)}
                  >
                    <option value="">Escolha a sala…</option>
                    {data.classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channel !== "internal" && segmentKind === "kid" && (
                <div className="space-y-1.5">
                  <Label>Criança *</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    value={kidId}
                    onChange={(event) => setKidId(event.target.value)}
                  >
                    <option value="">Escolha a criança…</option>
                    {data.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {channel === "email" && (
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label>Assunto do e-mail *</Label>
                  <Input
                    placeholder="Assunto da mensagem"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={160}
                  />
                </div>
              )}
            </div>

            {channel !== "internal" && segmentKind === "age" && (
              <div className="grid gap-3 sm:grid-cols-2 max-w-md">
                <div className="space-y-1.5">
                  <Label>Idade mínima (meses)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Ex: 12"
                    value={minAge}
                    onChange={(event) => setMinAge(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Idade máxima (meses)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Ex: 36"
                    value={maxAge}
                    onChange={(event) => setMaxAge(event.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Conteúdo da mensagem *</Label>
                <span className="text-xs text-muted-foreground">
                  {body.length}/2000 caracteres
                </span>
              </div>
              <Textarea
                rows={3}
                maxLength={2000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Escreva a mensagem para os responsáveis…"
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                Dica: Nunca inclua dados clínicos confidenciais ou códigos de retirada em mensagens de campanha.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={
                  pending ||
                  body.trim().length < 2 ||
                  (channel === "internal" && !guardianPersonId && !conversationId) ||
                  (channel === "email" && subject.trim().length === 0) ||
                  (channel !== "internal" && segmentKind === "congregation" && !congregationId) ||
                  (channel !== "internal" && segmentKind === "classroom" && !classroomId) ||
                  (channel !== "internal" && segmentKind === "kid" && !kidId)
                }
                onClick={() => void submit()}
              >
                <Send className="mr-2 h-4 w-4" />
                {channel === "internal" ? "Enviar mensagem no chat" : "Disparar campanha"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Seção Histórico de Comunicações (1 Coluna com Modos Lista e Grade) */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Histórico de Comunicações</h2>
            <Badge variant="secondary" className="font-normal">
              {totalFilteredCount} {totalFilteredCount === 1 ? "registro" : "registros"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Campo de busca */}
            <div className="relative min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar mensagens..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-9 text-sm"
              />
            </div>

            {/* Filtro de canais */}
            <div className="flex rounded-md border p-0.5 bg-muted/30">
              <Button
                type="button"
                variant={channelFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setChannelFilter("all")}
              >
                Todos
              </Button>
              <Button
                type="button"
                variant={channelFilter === "whatsapp" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setChannelFilter("whatsapp")}
              >
                WhatsApp
              </Button>
              <Button
                type="button"
                variant={channelFilter === "email" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setChannelFilter("email")}
              >
                E-mail
              </Button>
              <Button
                type="button"
                variant={channelFilter === "internal" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setChannelFilter("internal")}
              >
                Chat
              </Button>
            </div>

            {/* Alternador Modo Lista vs Grade */}
            <div className="flex rounded-md border p-0.5 bg-muted/30" aria-label="Modo de visualização">
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
                title="Modo Lista (1 Coluna)"
                aria-label="Modo Lista"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
                title="Modo Grade"
                aria-label="Modo Grade"
              >
                <Grid2X2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Empty state quando nada for encontrado */}
        {totalFilteredCount === 0 && (
          <Card className="glass">
            <CardContent className="p-6">
              <EmptyState
                icon={MessageSquare}
                title="Nenhuma comunicação encontrada"
                description={
                  searchQuery || channelFilter !== "all"
                    ? "Tente ajustar os filtros ou o termo de busca para encontrar registros."
                    : "Mensagens operacionais, disparos de campanhas e conversas aparecerão aqui."
                }
              />
            </CardContent>
          </Card>
        )}

        {/* MODO LISTA (1 COLUNA) */}
        {viewMode === "list" && totalFilteredCount > 0 && (
          <div className="space-y-3">
            {/* Conversas Internas */}
            {filteredConversations.map((conversation) => (
              <Card key={conversation.id} className="glass transition-all hover:border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {getChannelBadge("internal")}
                      <span className="font-semibold text-sm sm:text-base">
                        {conversation.guardianName}
                        {conversation.childName ? ` · ${conversation.childName}` : ""}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <Badge className="bg-primary text-primary-foreground">{conversation.unreadCount} nova(s)</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => {
                          setChannel("internal")
                          setConversationId(conversation.id)
                          setGuardianPersonId(conversation.guardianPersonId)
                          setIsFormOpen(true)
                          void markKidConversationRead(conversation.id)
                        }}
                      >
                        Responder no chat
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setDeleteConfirm({
                            id: conversation.id,
                            kind: "conversation",
                            title: `Conversa com ${conversation.guardianName}`,
                          })
                        }
                        title="Excluir conversa"
                        aria-label={`Excluir conversa com ${conversation.guardianName}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-md bg-muted/20 p-2.5 border border-border/40">
                    {conversation.messages.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Nenhuma mensagem nesta conversa.</p>
                    )}
                    {conversation.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg p-2.5 text-sm ${
                          message.senderKind === "staff" ? "ml-6 sm:ml-12 bg-primary/10" : "mr-6 sm:mr-12 bg-muted/80"
                        }`}
                      >
                        <p>{message.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {message.senderName} · {formatDateTime(message.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* Mensagens Operacionais e Campanhas */}
            {filteredMessages.map((message) => (
              <Card key={message.id} className="glass transition-all hover:border-border">
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {getChannelBadge(message.channel)}
                      {getStatusBadge(message.status)}
                      <span className="font-semibold text-sm sm:text-base">
                        {message.subject || "(sem assunto)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(message.createdAt)}
                        {message.createdByName ? ` · ${message.createdByName}` : ""}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-2"
                        onClick={() =>
                          setDeleteConfirm({
                            id: message.id,
                            kind: "message",
                            title: message.subject || "Comunicação",
                          })
                        }
                        title="Excluir card"
                        aria-label={`Excluir comunicação ${message.subject || ""}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{message.body}</p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                    {message.deliveredCount > 0 && (
                      <Badge variant="default" className="bg-emerald-600 text-white">
                        {message.deliveredCount} entregue(s)
                      </Badge>
                    )}
                    {message.sentCount > 0 && <Badge variant="secondary">{message.sentCount} enviada(s)</Badge>}
                    {message.queuedCount > 0 && <Badge variant="secondary">{message.queuedCount} na fila</Badge>}
                    {message.pendingCount > 0 && <Badge variant="outline">{message.pendingCount} pendente(s)</Badge>}
                    {message.failedCount > 0 && <Badge variant="destructive">{message.failedCount} falha(s)</Badge>}
                    {message.pendingCount +
                      message.queuedCount +
                      message.sentCount +
                      message.deliveredCount +
                      message.failedCount ===
                      0 && <Badge variant="outline">sem destinatários elegíveis</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* MODO GRADE (CARDS RESPONSIVOS) */}
        {viewMode === "grid" && totalFilteredCount > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Conversas Internas */}
            {filteredConversations.map((conversation) => (
              <Card key={conversation.id} className="glass flex flex-col justify-between transition-all hover:border-border">
                <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        {getChannelBadge("internal")}
                        {conversation.unreadCount > 0 && (
                          <Badge className="bg-primary text-primary-foreground">{conversation.unreadCount} nova(s)</Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setDeleteConfirm({
                            id: conversation.id,
                            kind: "conversation",
                            title: `Conversa com ${conversation.guardianName}`,
                          })
                        }
                        title="Excluir conversa"
                        aria-label="Excluir conversa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div>
                      <p className="font-semibold text-sm">
                        {conversation.guardianName}
                        {conversation.childName ? ` · ${conversation.childName}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Última mensagem: {formatDateTime(conversation.lastMessageAt)}
                      </p>
                    </div>

                    <div className="max-h-36 space-y-1.5 overflow-y-auto rounded bg-muted/20 p-2 text-xs border border-border/40">
                      {conversation.messages.slice(-3).map((message) => (
                        <div key={message.id} className="line-clamp-2">
                          <span className="font-medium text-foreground">{message.senderName}:</span>{" "}
                          <span className="text-muted-foreground">{message.body}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-3 text-xs"
                    onClick={() => {
                      setChannel("internal")
                      setConversationId(conversation.id)
                      setGuardianPersonId(conversation.guardianPersonId)
                      setIsFormOpen(true)
                      void markKidConversationRead(conversation.id)
                    }}
                  >
                    Abrir conversa no chat
                  </Button>
                </CardContent>
              </Card>
            ))}

            {/* Mensagens Operacionais e Campanhas */}
            {filteredMessages.map((message) => (
              <Card key={message.id} className="glass flex flex-col justify-between transition-all hover:border-border">
                <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        {getChannelBadge(message.channel)}
                        {getStatusBadge(message.status)}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() =>
                          setDeleteConfirm({
                            id: message.id,
                            kind: "message",
                            title: message.subject || "Comunicação",
                          })
                        }
                        title="Excluir card"
                        aria-label="Excluir card"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div>
                      <p className="font-semibold text-sm line-clamp-1">{message.subject || "(sem assunto)"}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(message.createdAt)}
                        {message.createdByName ? ` · ${message.createdByName}` : ""}
                      </p>
                    </div>

                    <p className="line-clamp-3 text-xs text-muted-foreground">{message.body}</p>
                  </div>

                  <div className="flex flex-wrap gap-1 text-[11px] pt-2 border-t border-border/40">
                    {message.deliveredCount > 0 && (
                      <Badge variant="default" className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                        {message.deliveredCount} entregue(s)
                      </Badge>
                    )}
                    {message.sentCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {message.sentCount} enviada(s)
                      </Badge>
                    )}
                    {message.queuedCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {message.queuedCount} na fila
                      </Badge>
                    )}
                    {message.pendingCount > 0 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {message.pendingCount} pendente(s)
                      </Badge>
                    )}
                    {message.failedCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {message.failedCount} falha(s)
                      </Badge>
                    )}
                    {message.pendingCount +
                      message.queuedCount +
                      message.sentCount +
                      message.deliveredCount +
                      message.failedCount ===
                      0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">sem destinatários</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Diálogo de confirmação de exclusão */}
      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir card de comunicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteConfirm?.title}</strong>? Este registro será removido da listagem
              e eventuais envios que ainda estiverem na fila serão cancelados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault()
                void handleDelete()
              }}
            >
              {isDeleting ? "Excluindo..." : "Excluir comunicação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
