"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Bell, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PushActivation } from "./push-activation"
import { inboxModules, type InboxItem, type InboxPage } from "@/lib/notifications/inbox-contract"
import { chatRequest } from "@/components/ministries/chat-client"
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const router = useRouter()
  const channelId = useId()
  const [open, setOpen] = useState(false)
  const [module, setModule] = useState("")
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState<InboxPage | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [showPush, setShowPush] = useState(false)
  const requestVersion = useRef(0)
  const load = useCallback(async (cursor?: string) => {
    const version = ++requestVersion.current
    const params = new URLSearchParams()
    if (module) params.set("module", module)
    if (unreadOnly) params.set("unread", "true")
    if (cursor) params.set("cursor", cursor)
    try {
      const data = await chatRequest<InboxPage>(`/api/v1/notifications/inbox?${params}`)
      if (version !== requestVersion.current) return
      setPage(previous => cursor && previous ? { ...data, items: [...previous.items, ...data.items.filter(item => !previous.items.some(old => old.id === item.id))] } : data)
      setError("")
    } catch (err) { if (version === requestVersion.current) setError(err instanceof Error ? err.message : "Não foi possível atualizar os avisos") }
  }, [module, unreadOnly])
  useEffect(() => {
    const client = createClient()
    const update = () => { if (document.visibilityState === "visible") void load() }
    const channel = client.channel(`personal-inbox-${channelId}`).on("postgres_changes", { event: "*", schema: "public", table: "notification_inbox" }, update)
      .subscribe(status => { if (status === "SUBSCRIBED") update() })
    const timer = setInterval(update, 30_000)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    update()
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); void client.removeChannel(channel) }
  }, [load, channelId])
  async function read(item?: InboxItem) {
    if (!item && !page?.through) return
    setBusy(true)
    try {
      const result = await chatRequest<{ href?: string }>("/api/v1/notifications/inbox", "POST", item ? { action: "read", id: item.id } : { action: "read-all", through: page?.through })
      await load()
      if (item && result.href?.startsWith("/") && !result.href.startsWith("//")) { setOpen(false); router.push(result.href) }
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível marcar o aviso") }
    finally { setBusy(false) }
  }
  return <>
    <Button type="button" variant="ghost" size="icon" className="relative shrink-0" aria-label={`Notificações${page?.unread ? `, ${page.unread} não lidas` : ""}`} onClick={() => { setOpen(true); void load() }}>
      <Bell className="h-5 w-5" />
      {!!page?.unread && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{page.unread > 99 ? "99+" : page.unread}</span>}
      {!!error && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-amber-500" />}
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Notificações</DialogTitle><DialogDescription>{page ? `${page.unread} aviso(s) não lido(s)` : error ? "Não foi possível carregar seus avisos." : "Carregando seus avisos…"}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Módulo <select aria-label="Filtrar notificações por módulo" className="ml-1 max-w-40 rounded-md border bg-background p-2" value={module} onChange={event => { setModule(event.target.value); setPage(null) }}><option value="">Todos</option>{Object.entries(inboxModules).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={event => { setUnreadOnly(event.target.checked); setPage(null) }} />Não lidas</label>
          <Button size="sm" variant="outline" disabled={busy || !page?.unread} onClick={() => void read()}>Marcar todas como lidas</Button>
        </div>
        {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>}
        {!page && !error && <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Carregando" />}
        {page?.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma notificação neste filtro.</p>}
        <div className="space-y-2">{page?.items.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => void read(item)} className={cn("w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary", !item.readAt && "border-primary/40 bg-primary/5")}>
          <div className="flex items-start gap-2"><p className="min-w-0 flex-1 font-semibold">{item.title}</p>{!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}</div>
          <p className="mt-1 break-words text-sm text-muted-foreground">{item.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">{inboxModules[item.module]} · {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(item.createdAt))}</p>
        </button>)}</div>
        {page?.nextCursor && <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); void load(page.nextCursor!).finally(() => setBusy(false)) }}>Carregar mais</Button>}
        <Button variant="ghost" onClick={() => setShowPush(!showPush)}>{showPush ? "Ocultar opções do dispositivo" : "Ativar avisos neste dispositivo"}</Button>
        {showPush && <PushActivation />}
      </DialogContent>
    </Dialog>
  </>
}
