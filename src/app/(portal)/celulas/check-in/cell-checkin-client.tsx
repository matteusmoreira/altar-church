"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Church, QrCode, TriangleAlert } from "lucide-react"
import { confirmCellCheckin } from "@/lib/cells/actions"
import type { CellCheckinPreview } from "@/lib/cells/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function CellCheckinClient({ preview }: { preview: CellCheckinPreview | null }) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(Boolean(preview?.alreadyCheckedIn))
  const [error, setError] = useState("")

  return <main className="flex min-h-screen items-center justify-center p-4 gradient-hero"><Card className="w-full max-w-md glass-strong"><CardHeader className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary text-white">{done ? <CheckCircle2 /> : <QrCode />}</div><CardTitle>{done ? "Check-in confirmado" : "Check-in da célula"}</CardTitle><CardDescription>{preview ? `${preview.cellName} · ${preview.meetingTitle}` : "QR não encontrado"}</CardDescription></CardHeader><CardContent className="space-y-4 text-center">
    {!preview || !preview.available ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><TriangleAlert className="mx-auto mb-2" />QR inválido, expirado ou encontro encerrado.</div> : done ? <p className="text-sm text-muted-foreground">Sua presença foi registrada. Obrigado por participar!</p> : <><p className="text-sm text-muted-foreground">Confirme sua presença em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(preview.startsAt))}.</p><Button className="w-full" disabled={pending} onClick={() => startTransition(async () => { setError(""); const result = await confirmCellCheckin(preview.token); if (result.ok) setDone(true); else setError(result.error ?? "Check-in não concluído") })}><CheckCircle2 />{pending ? "Confirmando..." : "Confirmar check-in"}</Button>{error && <p className="text-sm text-destructive">{error}</p>}</>}
    <Button render={<Link href="/celulas" />} variant="outline" className="w-full"><Church />Abrir portal Células</Button>
  </CardContent></Card></main>
}
