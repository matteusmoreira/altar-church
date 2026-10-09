"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ClientEventQr } from "./client-event-qr"
import type { IScannerControls } from "@zxing/browser"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createEventCheckinSession, closeEventCheckinSession, manualCheckInEventParticipant, receptionEventQr } from "@/lib/events/actions"
import type { EventDetail } from "@/lib/operational/data"

export function EventCheckinPanel({ event, canEdit, session }: { event: EventDetail; canEdit: boolean; session: { token: string; expiresAt: string } | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [qr, setQr] = useState("")
  const [message, setMessage] = useState("")
  const [scanning, setScanning] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const controls = useRef<IScannerControls | null>(null)
  const active = useRef(false)
  useEffect(() => () => { active.current = false; controls.current?.stop() }, [])
  function stopCamera() { active.current = false; controls.current?.stop(); controls.current = null; setScanning(false) }
  function scanValue(value: string) {
    stopCamera()
    let token = value.trim()
    try { const url = new URL(token); if (url.origin !== window.location.origin || !/^\/eventos\/check-in\/[0-9a-f-]+$/.test(url.pathname)) throw new Error(); token = url.pathname.split("/").pop()! } catch { if (!/^[0-9a-f-]{36}$/i.test(token)) { setMessage("QR inválido. Use o comprovante deste evento."); return } }
    startTransition(async () => { const result = await receptionEventQr({ eventId: event.id, token }); if (result.ok) { setMessage(`${result.alreadyCheckedIn ? "Presença já registrada" : "Entrada confirmada"}: ${result.name}`); router.refresh() } else setMessage(result.error) })
  }
  async function camera() {
    setScanning(true); active.current = true; setMessage("")
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser")
      const reader = new BrowserQRCodeReader()
      const scanner = await reader.decodeFromVideoDevice(undefined, video.current!, (result, _error, scanner) => { if (result && active.current) { scanner.stop(); scanValue(result.getText()) } })
      if (active.current) controls.current = scanner; else scanner.stop()
    } catch { stopCamera(); setMessage("Não foi possível acessar a câmera. Permita o acesso ou busque o participante pelo nome.") }
  }
  const participants = event.participants.filter(p => p.status === "going" && `${p.personName} ${p.personEmail} ${p.personPhone}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")))
  return <div className="space-y-4">
    <Card><CardHeader><CardTitle>Check-in do evento</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{session ? `Aberto até ${new Date(session.expiresAt).toLocaleString("pt-BR", { timeZone: event.timezone || "America/Sao_Paulo" })}` : "Check-in fechado"} · {event.allowWalkIns ? "Entrada sem inscrição permitida, respeitando vagas" : "Inscrição prévia obrigatória"}</p>{canEdit && <Button disabled={pending || event.status !== "published"} onClick={() => startTransition(async () => { const result = session ? await closeEventCheckinSession(event.id) : await createEventCheckinSession(event.id); if (result.ok) { toast.success(session ? "Check-in encerrado" : "Check-in aberto"); router.refresh() } else toast.error(result.error) })}>{session ? "Encerrar check-in" : "Abrir check-in"}</Button>}{session && <div className="flex flex-wrap items-center gap-5"><div className="rounded-lg bg-white p-3"><ClientEventQr path={`/eventos/check-in/sessao/${session.token}`} size={170} /></div><div className="space-y-2"><p className="text-sm">QR para autoatendimento dos participantes</p><Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(`${window.location.origin}/eventos/check-in/sessao/${session.token}`); toast.success("Link copiado") }}>Copiar link</Button></div></div>}</CardContent></Card>
    {canEdit && <Card><CardHeader><CardTitle>Recepção</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><Button disabled={!session || pending || scanning} onClick={camera}>Ler QR pela câmera</Button>{scanning && <Button variant="outline" onClick={stopCamera}>Parar câmera</Button>}</div><video ref={video} hidden={!scanning} className="max-h-80 w-full rounded-lg bg-black" muted playsInline /><div className="flex gap-2"><Input aria-label="Link ou código do participante" value={qr} onChange={e => setQr(e.target.value)} placeholder="Cole o link ou código do QR" /><Button variant="outline" disabled={!session || pending || !qr} onClick={() => scanValue(qr)}>Conferir</Button></div>{message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}<Input aria-label="Buscar participante para check-in" placeholder="Buscar por nome, telefone ou e-mail" value={query} onChange={e => setQuery(e.target.value)} /><div className="divide-y rounded-lg border">{participants.map(p => <div key={p.id} className="flex items-center justify-between gap-3 p-3"><div><p className="text-sm font-medium">{p.personName}</p><p className="text-xs text-muted-foreground">{p.kind === "guest" ? "Visitante" : "Membro"} · {p.checkedIn ? "Presente" : "Entrada pendente"}</p></div><Button size="sm" variant="outline" disabled={!session || pending || p.checkedIn} onClick={() => startTransition(async () => { const result = await manualCheckInEventParticipant({ eventId: event.id, kind: p.kind, attendeeId: p.id }); if (result.ok) { setMessage(`Entrada confirmada: ${result.name}`); router.refresh() } else setMessage(result.error) })}>Confirmar entrada</Button></div>)}{!participants.length && <p className="p-4 text-sm text-muted-foreground">Nenhum inscrito confirmado encontrado.</p>}</div></CardContent></Card>}
  </div>
}
