"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, Bell, BellOff, FileText, Loader2, MessageCircle, Mic, Paperclip, Pencil, Pin, Reply, Send, Square, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import { CHAT_EMOJIS, CHAT_MIME_EXTENSIONS, chatUploadSchema } from "@/lib/ministries/chat-contract"
import type { ChatCursor, MinistryChatMessage, MinistryChatPage } from "@/lib/ministries/chat-contract"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PushActivation } from "@/components/notifications/push-activation"
import { cn } from "@/lib/utils"
import { announceChatChange, chatRequest, ChatRequestError, useMinistryChatSummaries } from "./chat-client"

type DraftFile = { file: File; id?: string; error?: string; preview?: string }
const timestamp = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })

export function MinistryChatBadge({ ministryId }: { ministryId?: string }) {
  const { chats } = useMinistryChatSummaries()
  const count = chats.filter(chat => !ministryId || chat.id === ministryId).reduce((sum, chat) => sum + chat.unread, 0)
  return count > 0 ? <span aria-label={`${count} mensagens não lidas`} className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{count > 99 ? "99+" : count}</span> : null
}

export function MinistryChat({ ministryId, name }: { ministryId: string; name: string }) {
  const endpoint = `/api/v1/ministries/${ministryId}/chat`
  const [page, setPage] = useState<MinistryChatPage | null>(null)
  const [error, setError] = useState("")
  const [sendError, setSendError] = useState("")
  const [denied, setDenied] = useState(false)
  const [body, setBody] = useState("")
  const [files, setFiles] = useState<DraftFile[]>([])
  const [reply, setReply] = useState<MinistryChatMessage | null>(null)
  const [editing, setEditing] = useState<MinistryChatMessage | null>(null)
  const [editBody, setEditBody] = useState("")
  const [deleting, setDeleting] = useState<MinistryChatMessage | null>(null)
  const [clearing, setClearing] = useState(false)
  const [sending, setSending] = useState(false)
  const [commandBusy, setCommandBusy] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null)
  const unreadCaptured = useRef(false)
  const [newMessages, setNewMessages] = useState(false)
  const scroll = useRef<HTMLDivElement>(null)
  const uploadInput = useRef<HTMLInputElement>(null)
  const pageRef = useRef<MinistryChatPage | null>(null)
  const mounted = useRef(false)
  const fetchBusy = useRef(false)
  const refetch = useRef(false)
  const clientId = useRef<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const recordingStream = useRef<MediaStream | null>(null)
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const filesRef = useRef<DraftFile[]>([])
  const lastRead = useRef("")
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abort = useRef<AbortController | null>(null)

  const toBottom = useCallback(() => { const element = scroll.current; if (element) element.scrollTop = element.scrollHeight; setNewMessages(false) }, [])
  const refresh = useCallback(async () => {
    if (fetchBusy.current) { refetch.current = true; return }
    fetchBusy.current = true
    try {
      do {
        refetch.current = false
        const old = pageRef.current
        const element = scroll.current
        const nearBottom = !old || !element || element.scrollHeight - element.scrollTop - element.clientHeight < 100
        const signal = abort.current?.signal
        const result = await chatRequest<MinistryChatPage>(endpoint, "GET", undefined, signal)
        const olderIds = old?.messages.filter(message => !result.messages.some(item => item.id === message.id)).map(message => message.id) ?? []
        const updated: MinistryChatMessage[] = []
        for (let index = 0; index < olderIds.length; index += 100) {
          const batch = await chatRequest<MinistryChatPage>(`${endpoint}?ids=${encodeURIComponent(JSON.stringify(olderIds.slice(index, index + 100)))}`, "GET", undefined, signal)
          updated.push(...batch.messages)
        }
        if (updated.length) {
          result.messages = [...updated, ...result.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
          result.nextCursor = old!.nextCursor
        }
        if (!mounted.current) return
        const changed = old && result.messages.at(-1)?.id !== old.messages.at(-1)?.id
        if (!unreadCaptured.current) { unreadCaptured.current = true; setFirstUnreadId(result.firstUnreadId ?? null) }
        pageRef.current = result
        setPage(result); setError(""); setDenied(false)
        if (nearBottom) requestAnimationFrame(toBottom)
        else if (changed) setNewMessages(true)
      } while (refetch.current && mounted.current)
    } catch (error) {
      if (!mounted.current || (error instanceof Error && error.name === "AbortError")) return
      if (error instanceof ChatRequestError && [401, 403, 404].includes(error.status)) { setPage(null); pageRef.current = null; setDenied(true) }
      setError(error instanceof Error ? error.message : "Conexão interrompida. Tentando atualizar…")
    } finally { fetchBusy.current = false }
  }, [endpoint, toBottom])

  useEffect(() => {
    mounted.current = true
    abort.current = new AbortController()
    const client = createClient()
    const update = () => { void refresh() }
    const channel = client.channel(`ministry-chat-${ministryId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ministry_chat_messages", filter: `ministry_id=eq.${ministryId}` }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "ministry_chat_reactions", filter: `ministry_id=eq.${ministryId}` }, update)
      .subscribe(status => { if (status === "SUBSCRIBED") update() })
    update()
    const timer = setInterval(update, 15_000)
    window.addEventListener("focus", update)
    const visible = () => { if (document.visibilityState === "visible") update() }
    document.addEventListener("visibilitychange", visible)
    return () => {
      mounted.current = false; abort.current?.abort(); clearInterval(timer)
      window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", visible); void client.removeChannel(channel)
      if (recordingTimer.current) clearInterval(recordingTimer.current)
      if (readTimer.current) clearTimeout(readTimer.current)
      if (recorder.current?.state === "recording") recorder.current.stop()
      recordingStream.current?.getTracks().forEach(track => track.stop())
      filesRef.current.forEach(file => { if (file.preview) URL.revokeObjectURL(file.preview) })
    }
  }, [ministryId, refresh])

  useEffect(() => {
    const root = scroll.current
    if (!root || !page) return
    const observer = new IntersectionObserver(entries => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return
      const visible = entries.filter(entry => entry.isIntersecting).map(entry => entry.target.getAttribute("data-message-id"))
      const last = page.messages.filter(message => visible.includes(message.id)).at(-1)
      if (!last || lastRead.current === last.id) return
      if (readTimer.current) clearTimeout(readTimer.current)
      readTimer.current = setTimeout(() => {
        if (document.visibilityState !== "visible" || !document.hasFocus()) return
        const target = root.querySelector(`[data-message-id="${last.id}"]`)
        if (!target) return
        const bounds = target.getBoundingClientRect(), container = root.getBoundingClientRect()
        if (bounds.bottom <= container.top || bounds.top >= container.bottom) return
        void chatRequest(endpoint, "PATCH", { action: "read", messageId: last.id }).then(() => { lastRead.current = last.id; announceChatChange() }).catch(() => {})
      }, 500)
    }, { root, threshold: 0.01 })
    root.querySelectorAll("[data-message-id]").forEach(element => observer.observe(element))
    return () => { observer.disconnect(); if (readTimer.current) clearTimeout(readTimer.current) }
  }, [page, endpoint])

  function setDraftFiles(next: DraftFile[]) { filesRef.current = next; setFiles(next); clientId.current = null }
  function addFiles(chosen: File[]) {
    if (filesRef.current.length + chosen.length > 5) { toast.error("Escolha até cinco anexos por mensagem"); return }
    const next: DraftFile[] = []
    for (const file of chosen) {
      const mimeType = file.type.split(";")[0] || Object.entries(CHAT_MIME_EXTENSIONS).find(([, extensions]) => extensions.includes(file.name.split(".").pop()?.toLowerCase() ?? ""))?.[0] || ""
      const checked = chatUploadSchema.safeParse({ name: file.name, mimeType, sizeBytes: file.size })
      if (!checked.success) { toast.error(`${file.name}: formato inválido ou arquivo acima de 10 MB`); continue }
      const normalized = new File([file], file.name, { type: mimeType })
      next.push({ file: normalized, preview: mimeType.startsWith("image/") || mimeType.startsWith("audio/") ? URL.createObjectURL(normalized) : undefined })
    }
    setDraftFiles([...filesRef.current, ...next])
  }
  function removeFile(index: number) { const item = files[index]; if (item.preview) URL.revokeObjectURL(item.preview); setDraftFiles(files.filter((_, itemIndex) => itemIndex !== index)) }

  async function send() {
    if (sending || (!body.trim() && !files.length)) return
    setSending(true)
    clientId.current ??= crypto.randomUUID()
    const id = clientId.current
    try {
      const client = createClient()
      const uploaded = [...filesRef.current]
      for (let index = 0; index < uploaded.length; index++) {
        const draft = uploaded[index]
        if (draft.id) continue
        const prepared = await chatRequest<{ id: string; path: string; token: string; bucket: string }>(`${endpoint}/uploads`, "POST", { name: draft.file.name, mimeType: draft.file.type, sizeBytes: draft.file.size })
        const result = await client.storage.from(prepared.bucket).uploadToSignedUrl(prepared.path, prepared.token, draft.file, { contentType: draft.file.type, upsert: false })
        if (result.error) throw new Error(`Falha ao enviar ${draft.file.name}. Tente novamente`)
        await chatRequest(`${endpoint}/uploads`, "PATCH", { id: prepared.id })
        uploaded[index] = { ...draft, id: prepared.id }
        filesRef.current = uploaded; setFiles([...uploaded])
      }
      await chatRequest(endpoint, "POST", { clientId: id, body, replyToId: reply?.id ?? null, attachmentIds: uploaded.map(file => file.id) })
      if (!mounted.current) return
      filesRef.current.forEach(file => { if (file.preview) URL.revokeObjectURL(file.preview) })
      setDraftFiles([]); setBody(""); setReply(null); clientId.current = null; setError(""); setSendError("")
      await refresh(); requestAnimationFrame(toBottom); announceChatChange()
    } catch (error) {
      if (mounted.current) setSendError(error instanceof Error ? error.message : "Falha no envio. Seu rascunho foi mantido")
    } finally { if (mounted.current) setSending(false) }
  }
  async function command(input: unknown) {
    setCommandBusy(true)
    try { await chatRequest(endpoint, "PATCH", input); await refresh(); announceChatChange(); return true }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir"); return false }
    finally { if (mounted.current) setCommandBusy(false) }
  }
  async function older(cursor: ChatCursor) {
    if (loadingOlder) return
    setLoadingOlder(true)
    try {
      const result = await chatRequest<MinistryChatPage>(`${endpoint}?before=${encodeURIComponent(JSON.stringify(cursor))}`)
      if (!mounted.current) return
      const height = scroll.current?.scrollHeight ?? 0
      const offset = scroll.current?.scrollTop ?? 0
      const existing = pageRef.current
      if (!existing) return
      const next = { ...existing, messages: [...result.messages.filter(message => !existing.messages.some(item => item.id === message.id)), ...existing.messages], nextCursor: result.nextCursor }
      pageRef.current = next; setPage(next)
      requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollTop = offset + scroll.current.scrollHeight - height })
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível carregar o histórico") }
    finally { if (mounted.current) setLoadingOlder(false) }
  }
  async function jumpToMessage(id: string) {
    if (loadingOlder) return
    setLoadingOlder(true)
    try {
      while (mounted.current && !pageRef.current?.messages.some(message => message.id === id) && pageRef.current?.nextCursor) {
        const cursor = pageRef.current.nextCursor
        const result = await chatRequest<MinistryChatPage>(`${endpoint}?before=${encodeURIComponent(JSON.stringify(cursor))}`, "GET", undefined, abort.current?.signal)
        const existing = pageRef.current
        if (!mounted.current || !existing) return
        if (result.nextCursor?.id === cursor.id) throw new Error("Não foi possível avançar no histórico")
        const next = { ...existing, messages: [...result.messages.filter(message => !existing.messages.some(item => item.id === message.id)), ...existing.messages], nextCursor: result.nextCursor }
        pageRef.current = next; setPage(next)
      }
      if (!pageRef.current?.messages.some(message => message.id === id)) { toast.error("Mensagem não disponível no histórico"); return }
      requestAnimationFrame(() => { scroll.current?.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }) })
    } catch(error) { if (mounted.current) toast.error(error instanceof Error ? error.message : "Não foi possível abrir a mensagem") }
    finally { if (mounted.current) setLoadingOlder(false) }
  }
  async function startRecording() {
    if (!("MediaRecorder" in window) || !navigator.mediaDevices?.getUserMedia) { toast.error("Gravação indisponível neste navegador. Você pode anexar um áudio gravado"); return }
    if (files.length >= 5) { toast.error("Remova um anexo antes de gravar o áudio"); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return }
      recordingStream.current = stream
      const type = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(value => MediaRecorder.isTypeSupported(value))
      if (!type) { stream.getTracks().forEach(track => track.stop()); throw new Error("Formato de gravação indisponível neste navegador") }
      const current = new MediaRecorder(stream, { mimeType: type })
      recorder.current = current
      const chunks: Blob[] = []
      // eslint-disable-next-line react-hooks/purity -- Captured after the user clicks the microphone, never during render.
      const started = Date.now()
      current.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      current.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        if (recordingTimer.current) clearInterval(recordingTimer.current)
        if (!mounted.current) return
        setRecording(false)
        const duration = Math.min(180_000, Date.now() - started)
        void (async () => {
          const mime = type.split(";")[0]
          const blob = new Blob(chunks, { type: mime })
          const fixed = mime === "audio/webm" ? await (await import("fix-webm-duration")).default(blob, duration, { logger: false }) : blob
          if (mounted.current) addFiles([new File([fixed], `audio-${Date.now()}.${mime === "audio/mp4" ? "m4a" : mime.split("/")[1]}`, { type: mime })])
        })().catch(() => toast.error("Não foi possível preparar o áudio. Grave novamente"))
      }
      current.start(); setRecording(true); setRecordSeconds(0)
      recordingTimer.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - started) / 1000))
        if (Date.now() - started >= 179_000 && current.state === "recording") current.stop()
      }, 250)
    } catch { toast.error("Não foi possível acessar o microfone. Permita o acesso nas configurações do navegador") }
  }
  function cancelRecording() {
    if (recorder.current) { recorder.current.onstop = () => {}; if (recorder.current.state === "recording") recorder.current.stop() }
    recordingStream.current?.getTracks().forEach(track => track.stop())
    if (recordingTimer.current) clearInterval(recordingTimer.current)
    setRecording(false)
  }

  return <section aria-label={`Chat de ${name}`} className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
      <div className="flex min-w-0 items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><MessageCircle className="h-5 w-5" /></div><div className="min-w-0"><h2 className="truncate font-semibold">{name}</h2><p className="text-xs text-muted-foreground">Conversa interna do ministério</p></div></div>
      <div className="flex flex-wrap gap-2">
        {page?.canManage && <Button variant="outline" size="sm" className="text-destructive" disabled={commandBusy || sending || loadingOlder || !page.messages.length} onClick={() => setClearing(true)}><Trash2 className="h-4 w-4" />Limpar todo o chat</Button>}
        <Button variant="outline" size="sm" onClick={() => setShowPush(!showPush)}><Bell className="h-4 w-4" />Notificações</Button>
        {page && <Button variant="ghost" size="sm" disabled={commandBusy} onClick={() => void command({ action: "preferences", muted: !page.muted })}>{page.muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}{page.muted ? "Reativar avisos" : "Silenciar"}</Button>}
      </div>
    </header>
    {showPush && <div className="space-y-3 border-b p-4"><PushActivation />{page && <Button variant="outline" disabled={commandBusy} onClick={() => void command({ action: "preferences", pushEnabled: !page.pushEnabled })}>{page.pushEnabled ? "Desativar push deste ministério" : "Receber push deste ministério"}</Button>}</div>}
    {page && page.pinned.length > 0 && <div className="space-y-2 border-b bg-muted/30 p-3" aria-label="Mensagens fixadas"><p className="flex items-center gap-2 text-xs font-semibold"><Pin className="h-3.5 w-3.5" />Fixadas</p>{page.pinned.map(message => <div key={message.id} className="flex items-center gap-2"><button type="button" disabled={loadingOlder} className="min-w-0 flex-1 truncate text-left text-sm hover:underline" aria-label={`Abrir mensagem fixada de ${message.senderName}`} onClick={() => void jumpToMessage(message.id)}><span className="font-semibold">{message.senderName}: </span>{message.body || "Anexo"}</button>{page.canManage && <Button variant="ghost" size="icon" aria-label="Desafixar mensagem" disabled={commandBusy} onClick={() => void command({ action: "pin", messageId: message.id, pinned: false })}><X className="h-4 w-4" /></Button>}</div>)}</div>}
    <div ref={scroll} className="h-[min(55dvh,560px)] min-h-72 space-y-4 overflow-y-auto overscroll-contain p-3 sm:p-5" role="log" aria-label="Mensagens" aria-relevant="additions">
      {!page && !error && <p role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando conversa…</p>}
      {firstUnreadId && <div className="mb-2 text-center"><Button variant="outline" size="sm" disabled={loadingOlder} onClick={() => void jumpToMessage(firstUnreadId)}>{loadingOlder ? "Abrindo histórico…" : "Ir à primeira mensagem não lida"}</Button></div>}
      {page?.nextCursor && <div className="text-center"><Button variant="outline" size="sm" disabled={loadingOlder} onClick={() => void older(page.nextCursor!)}>{loadingOlder ? "Carregando…" : "Carregar mensagens anteriores"}</Button></div>}
      {page?.messages.length === 0 && <div className="py-16 text-center"><MessageCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">A conversa começa aqui</p><p className="mt-1 text-sm text-muted-foreground">Envie uma mensagem para o seu ministério.</p></div>}
      {page?.messages.map(message => {
        const own = message.senderId === page.actorId
        return <article key={message.id} data-message-id={message.id} className={cn("flex gap-2.5", own && "flex-row-reverse")}>
          <Avatar className="h-8 w-8 shrink-0"><AvatarImage src={message.senderPhoto ?? undefined} alt="" /><AvatarFallback className="text-xs">{message.senderName.split(" ").slice(0, 2).map(part => part[0]).join("")}</AvatarFallback></Avatar>
          <div className={cn("min-w-0 max-w-[85%] space-y-1 sm:max-w-[75%]", own && "items-end")}>
            <div className={cn("rounded-2xl border px-3 py-2.5", own ? "border-primary/20 bg-primary/10" : "bg-muted/40")}>
              <p className="mb-1 text-xs font-semibold">{message.senderName}{message.pinnedAt && <Pin className="ml-1 inline h-3 w-3" />}</p>
              {message.reply && <blockquote className="mb-2 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground"><p className="font-medium">{message.reply.senderName}</p><p className="line-clamp-2">{message.reply.body}</p></blockquote>}
              {message.deletedAt ? <p className="text-sm italic text-muted-foreground">Mensagem removida</p> : <>
                {message.body && <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.body}</p>}
                {message.attachments.map(file => <div key={file.id} className="mt-2 min-w-0">
                  {file.mimeType.startsWith("image/") ? <a href={file.url} target="_blank" rel="noreferrer"><Image unoptimized src={file.url} alt={file.name} width={480} height={360} className="h-auto max-h-72 w-auto max-w-full rounded-lg object-contain" /></a>
                    : file.mimeType.startsWith("audio/") ? <audio controls preload="none" src={file.url} aria-label={file.name} className="max-w-full" />
                    : <a href={file.url} className="flex items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</span></a>}
                </div>)}
              </>}
              <p className="mt-1.5 text-[10px] text-muted-foreground">{timestamp(message.createdAt)}{message.editedAt ? " · editada" : ""}</p>
            </div>
            {!message.deletedAt && <div className="flex flex-wrap items-center gap-1">
              {CHAT_EMOJIS.map(emoji => { const reaction = message.reactions.find(item => item.emoji === emoji); return <button key={emoji} type="button" disabled={commandBusy} aria-label={`Reagir com ${emoji}`} aria-pressed={reaction?.mine ?? false} onClick={() => void command({ action: "react", messageId: message.id, emoji, active: !reaction?.mine })} className={cn("min-h-8 rounded-full border px-2 text-xs transition-colors hover:bg-muted", reaction?.mine ? "border-primary bg-primary/10" : "border-transparent")}>{emoji}{reaction ? ` ${reaction.count}` : ""}</button> })}
              <Button variant="ghost" size="icon" aria-label="Responder mensagem" disabled={sending} onClick={() => { setReply(message); clientId.current = null }}><Reply className="h-3.5 w-3.5" /></Button>
              {own && <Button variant="ghost" size="icon" aria-label="Editar mensagem" onClick={() => { setEditing(message); setEditBody(message.body) }}><Pencil className="h-3.5 w-3.5" /></Button>}
              {(own || page.canManage) && <Button variant="ghost" size="icon" aria-label="Excluir mensagem" onClick={() => setDeleting(message)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              {page.canManage && <Button variant="ghost" size="icon" aria-label={message.pinnedAt ? "Desafixar mensagem" : "Fixar mensagem"} disabled={commandBusy} onClick={() => void command({ action: "pin", messageId: message.id, pinned: !message.pinnedAt })}><Pin className="h-3.5 w-3.5" /></Button>}
            </div>}
          </div>
        </article>
      })}
    </div>
    {newMessages && <div className="flex justify-center pb-2"><Button size="sm" onClick={toBottom}><ArrowDown className="h-4 w-4" />Novas mensagens</Button></div>}
    {(error || sendError) && <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert"><p>{sendError || error}</p>{!denied && <Button variant="outline" size="sm" onClick={() => void refresh()}>Atualizar conversa</Button>}</div>}
    {page && !denied && <form className="space-y-3 border-t p-3 sm:p-4" onSubmit={event => { event.preventDefault(); void send() }}>
      {reply && <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2 text-xs"><p className="truncate">Respondendo a {reply.senderName}: {reply.body || "Anexo"}</p><Button type="button" variant="ghost" size="icon" aria-label="Cancelar resposta" disabled={sending} onClick={() => { setReply(null); clientId.current = null }}><X className="h-4 w-4" /></Button></div>}
      {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((draft, index) => <div key={`${draft.file.name}-${index}`} className="max-w-full space-y-1 rounded-lg border p-2">
        <div className="flex items-center gap-2"><span className="max-w-48 truncate text-xs">{draft.file.name}</span><Button type="button" size="icon" variant="ghost" disabled={sending} aria-label={`Remover ${draft.file.name}`} onClick={() => removeFile(index)}><X className="h-3.5 w-3.5" /></Button></div>
        {draft.file.type.startsWith("image/") && draft.preview && <Image unoptimized src={draft.preview} alt="Prévia do anexo" width={120} height={80} className="h-20 w-auto max-w-48 rounded object-contain" />}
        {draft.file.type.startsWith("audio/") && <audio src={draft.preview} controls className="max-w-full" />}
      </div>)}</div>}
      {recording ? <div className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/5 p-3"><span role="status" className="text-sm text-destructive">Gravando · {recordSeconds}s / 180s</span><Button type="button" variant="outline" onClick={() => recorder.current?.stop()}><Square className="h-4 w-4" />Concluir</Button><Button type="button" variant="ghost" onClick={cancelRecording}>Cancelar</Button></div> : <>
        <Textarea aria-label="Mensagem" placeholder="Escreva para o ministério…" maxLength={5000} value={body} disabled={sending} rows={3} onChange={event => { setBody(event.target.value); clientId.current = null }} onKeyDown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send() } }} />
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><input ref={uploadInput} type="file" multiple className="hidden" accept={Object.values(CHAT_MIME_EXTENSIONS).flat().map(ext => `.${ext}`).join(",")} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = "" }} /><Button type="button" size="icon" variant="outline" aria-label="Anexar arquivos" disabled={sending} onClick={() => uploadInput.current?.click()}><Paperclip className="h-4 w-4" /></Button><Button type="button" size="icon" variant="outline" aria-label="Gravar áudio" disabled={sending} onClick={() => void startRecording()}><Mic className="h-4 w-4" /></Button><span className="text-[11px] text-muted-foreground">Até 10 MB por arquivo</span></div><Button type="submit" disabled={sending || (!body.trim() && !files.length)}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Enviando…" : sendError ? "Tentar enviar novamente" : "Enviar"}</Button></div>
      </>}
    </form>}
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !commandBusy) setEditing(null) }}><DialogContent><DialogHeader><DialogTitle>Editar mensagem</DialogTitle><DialogDescription>O histórico indicará que a mensagem foi editada.</DialogDescription></DialogHeader><Textarea aria-label="Texto da mensagem" value={editBody} maxLength={5000} onChange={event => setEditBody(event.target.value)} /><DialogFooter><Button disabled={commandBusy} onClick={() => { if (editing) void command({ action: "edit", messageId: editing.id, body: editBody }).then(ok => { if (ok) setEditing(null) }) }}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !commandBusy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Excluir mensagem?</DialogTitle><DialogDescription>A mensagem será substituída por “Mensagem removida” e seus anexos ficarão indisponíveis.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={commandBusy} onClick={() => setDeleting(null)}>Cancelar</Button><Button variant="destructive" disabled={commandBusy} onClick={() => { if (deleting) void command({ action: "delete", messageId: deleting.id }).then(ok => { if (ok) setDeleting(null) }) }}>Excluir</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={clearing} onOpenChange={open => { if (!commandBusy) setClearing(open) }}><DialogContent><DialogHeader><DialogTitle>Limpar todo o chat?</DialogTitle><DialogDescription>Todas as mensagens, respostas, reações, mensagens fixadas e anexos de {name} serão removidos para todos os participantes. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={commandBusy} onClick={() => setClearing(false)}>Cancelar</Button><Button variant="destructive" disabled={commandBusy || sending || loadingOlder} onClick={() => void command({ action: "clear" }).then(ok => { if (ok) { setClearing(false); setReply(null); setEditing(null); setDeleting(null); clientId.current = null; toast.success("Chat limpo para todos os participantes") } })}>{commandBusy ? "Limpando…" : "Confirmar limpeza"}</Button></DialogFooter></DialogContent></Dialog>
  </section>
}
