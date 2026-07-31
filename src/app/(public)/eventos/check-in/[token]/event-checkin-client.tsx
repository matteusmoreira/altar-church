"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CalendarDays, CheckCircle2, Church, QrCode, TriangleAlert } from "lucide-react"
import { checkInEventAttendee } from "@/lib/events/actions"
import type { EventCheckinPreview } from "@/lib/events/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function EventCheckinClient({ preview }: { preview: EventCheckinPreview | null }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(Boolean(preview?.alreadyCheckedIn))
  const [error, setError] = useState("")
  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background p-4"><Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{done ? <CheckCircle2 /> : <QrCode />}</div><CardTitle>{done ? "Check-in confirmado" : "Check-in do evento"}</CardTitle><CardDescription>{preview ? `${preview.eventTitle} · ${preview.attendeeName}` : "QR não encontrado"}</CardDescription></CardHeader><CardContent className="space-y-4 text-center">{!preview || !preview.available && !preview.alreadyCheckedIn ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><TriangleAlert className="mx-auto mb-2" />QR inválido, expirado ou check-in ainda não aberto.</div> : done ? <p className="text-sm text-muted-foreground">Sua presença foi registrada. Obrigado por participar!</p> : <><p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(preview.eventStartsAt))}</p><Button className="w-full" disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await checkInEventAttendee(preview.token); if (result.ok) setDone(true); else setError(result.error ?? "Check-in não concluído") })}>{pending ? "Confirmando..." : "Confirmar check-in"}</Button>{error && <p className="text-sm text-destructive">{error}</p>}</>}<Button render={<Link href="/" />} variant="outline" className="w-full"><Church />Abrir site</Button></CardContent></Card></main>
}
