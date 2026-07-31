"use client"

import { FormEvent, useState, useTransition } from "react"
import Link from "next/link"
import { CalendarDays, CheckCircle2, Church, MapPin, QrCode, TriangleAlert } from "lucide-react"
import { checkInEventSession } from "@/lib/events/actions"
import type { EventCheckinSessionPreview } from "@/lib/events/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function EventSessionCheckinClient({ preview }: { preview: EventCheckinSessionPreview | null }) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")
  function submit(event: FormEvent) { event.preventDefault(); startTransition(async () => { setError(""); const result = await checkInEventSession({ sessionToken: preview?.token ?? "", fullName: name, phone }); if (result.ok) setDone(true); else setError(result.error ?? "Check-in não concluído") }) }
  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background p-4"><Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{done ? <CheckCircle2 /> : <QrCode />}</div><CardTitle>{done ? "Presença registrada" : "Check-in do evento"}</CardTitle><CardDescription>{preview ? preview.eventTitle : "QR não encontrado"}</CardDescription></CardHeader><CardContent className="space-y-4">{!preview || !preview.available ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive"><TriangleAlert className="mx-auto mb-2" />Sessão inválida, expirada ou encerrada.</div> : done ? <div className="space-y-2 text-center"><p className="font-medium">Obrigado por participar!</p><p className="text-sm text-muted-foreground">Seu check-in foi tratado de forma idempotente.</p></div> : <form className="space-y-4" onSubmit={submit}><div className="flex gap-3 rounded-lg border p-3 text-sm"><CalendarDays className="h-4 w-4 text-primary" /><span>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(preview.eventStartsAt))}</span></div>{preview.eventLocation && <div className="flex gap-3 rounded-lg border p-3 text-sm"><MapPin className="h-4 w-4 text-primary" /><span>{preview.eventLocation}</span></div>}<div className="grid gap-2"><Label htmlFor="session-name">Nome completo</Label><Input id="session-name" value={name} onChange={(e) => setName(e.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="session-phone">Telefone</Label><Input id="session-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>{error && <p className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={pending}>{pending ? "Registrando..." : "Confirmar presença"}</Button><p className="text-center text-xs text-muted-foreground">Membro inscrito será vinculado ao cadastro; visitante fica registrado no tenant do evento.</p></form>}<Button render={<Link href="/" />} variant="outline" className="w-full"><Church />Abrir site</Button></CardContent></Card></main>
}
