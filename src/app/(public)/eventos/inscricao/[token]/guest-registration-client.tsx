"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CalendarDays, CheckCircle2, Church, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { cancelGuestEventRegistration } from "@/lib/events/actions"
import type { EventPublicRegistration } from "@/lib/events/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function GuestRegistrationClient({ registration }: { registration: EventPublicRegistration }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(registration.status)
  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background p-4"><Card className="w-full max-w-md shadow-xl"><CardHeader className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">{status === "canceled" ? <TriangleAlert /> : <CheckCircle2 />}</div><CardTitle>{status === "canceled" ? "Inscrição cancelada" : "Inscrição registrada"}</CardTitle><CardDescription>{registration.eventTitle}</CardDescription></CardHeader><CardContent className="space-y-4 text-center"><p className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" />{registration.fullName}</p>{status === "waitlisted" && <p className="rounded-lg border p-3 text-sm">Você está na lista de espera. Se uma vaga abrir, a igreja poderá promover sua inscrição.</p>}{status === "going" && <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await cancelGuestEventRegistration(registration.token); if (result.ok) { setStatus("canceled"); toast.success("Inscrição cancelada") } else toast.error(result.error ?? "Não foi possível cancelar") })}>{pending ? "Cancelando..." : "Cancelar inscrição"}</Button>}<Button render={<Link href={`/eventos/publico/${registration.eventToken}`} />} variant="outline" className="w-full"><Church />Voltar ao evento</Button></CardContent></Card></main>
}
