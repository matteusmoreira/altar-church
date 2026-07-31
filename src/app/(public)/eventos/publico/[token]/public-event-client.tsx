"use client"
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useState, useTransition } from "react"
import Link from "next/link"
import { CalendarDays, CheckCircle2, Church, Globe, MapPin, Users } from "lucide-react"
import { cancelGuestEventRegistration, registerGuestForEvent } from "@/lib/events/actions"
import type { EventPublicData, EventPublicRegistration } from "@/lib/events/types"
import { AcquisitionBeacon } from "@/components/public/acquisition-beacon"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short" }).format(new Date(value))
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 2) return digits ? `(${digits}` : ""
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function PublicEventClient({ event }: { event: EventPublicData }) {
  const [pending, startTransition] = useTransition()
  const [registration, setRegistration] = useState<EventPublicRegistration | null>(null)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState("")
  const [canceled, setCanceled] = useState(false)

  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    startTransition(async () => {
      setError("")
      const result = await registerGuestForEvent({ eventToken: event.token, fullName, email, phone, consent })
      if (result.ok) setRegistration(result.registration)
      else setError(result.error)
    })
  }

  const registrationLabel = event.capacityRemaining === 0 ? "lista de espera" : "inscrição"

  return <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/12 via-background to-background px-4 py-8 sm:py-12">
    <AcquisitionBeacon companySlug={event.companySlug} />
    <div className="fixed right-4 top-4 z-10"><ThemeToggle /></div>
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <Card className="overflow-hidden shadow-xl">
        {event.bannerUrl ? <div className="h-48 bg-muted sm:h-64"><img src={event.bannerUrl} alt="" className="h-full w-full object-cover" /></div> : null}
        <CardHeader className="space-y-3"><p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[.16em] text-primary"><Church className="h-4 w-4" />{event.churchName}</p><CardTitle className="text-3xl sm:text-4xl">{event.title}</CardTitle><CardDescription className="whitespace-pre-wrap text-base leading-relaxed">{event.description || "Participe conosco."}</CardDescription></CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl border p-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Quando</p><p className="text-muted-foreground">{formatDate(event.startsAt)}{event.endsAt ? ` até ${new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(event.endsAt))}` : ""}</p></div></div>
          <div className="flex gap-3 rounded-xl border p-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Onde</p><p className="text-muted-foreground">{event.isOnline ? "Evento online" : event.location || "Local a confirmar"}</p>{event.isOnline && event.onlineLink ? <a className="text-primary underline" href={event.onlineLink} target="_blank" rel="noreferrer">Abrir link</a> : null}</div></div>
          <div className="flex gap-3 rounded-xl border p-3"><Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Participação</p><p className="text-muted-foreground">{event.goingCount} confirmado(s){event.maxCapacity > 0 ? ` · ${event.capacityRemaining} vaga(s)` : ""}</p>{event.waitlistedCount > 0 ? <p className="text-xs text-muted-foreground">{event.waitlistedCount} na espera</p> : null}</div></div>
          {event.isOnline && <div className="flex gap-3 rounded-xl border p-3"><Globe className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Acesso</p><p className="text-muted-foreground">Link liberado conforme orientação da igreja.</p></div></div>}
        </CardContent>
      </Card>
      {event.registrationFormSlug && <Card className="h-fit shadow-xl"><CardHeader><CardTitle>Formulário complementar</CardTitle><CardDescription>{event.registrationFormTitle ?? "Preencha o formulário da igreja"}</CardDescription></CardHeader><CardContent><Button render={<a href={`/f/${event.companySlug}/${event.registrationFormSlug}`} />} className="w-full">Abrir formulário</Button></CardContent></Card>}

      <Card className="h-fit shadow-xl"><CardHeader><CardTitle>{registration ? "Inscrição confirmada" : "Inscreva-se"}</CardTitle><CardDescription>{registration ? "Guarde este comprovante. Ele também permite cancelar sua inscrição." : `Preencha seus dados para entrar na ${registrationLabel}.`}</CardDescription></CardHeader><CardContent>
        {registration ? <div className="space-y-4 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div><div><p className="font-semibold">{registration.fullName}</p><p className="text-sm text-muted-foreground">{registration.status === "waitlisted" ? "Você está na lista de espera." : "Sua presença foi reservada."}</p></div><Button render={<Link href={`/eventos/inscricao/${registration.token}`} />} variant="outline">Abrir comprovante</Button>{!canceled ? <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await cancelGuestEventRegistration(registration.token); if (result.ok) setCanceled(true); else setError(result.error ?? "Não foi possível cancelar") })}>{pending ? "Cancelando..." : "Cancelar inscrição"}</Button> : <p className="text-sm text-muted-foreground">Inscrição cancelada.</p>}{error && <p className="text-sm text-destructive">{error}</p>}</div> : <form className="space-y-4" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="event-full-name">Nome completo</Label><Input id="event-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="event-email">E-mail</Label><Input id="event-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional se informar telefone" /></div><div className="grid gap-2"><Label htmlFor="event-phone">Telefone</Label><Input id="event-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="opcional se informar e-mail" /></div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>Autorizo o uso destes dados para confirmar e acompanhar minha inscrição neste evento.</span></label>{error && <p className="text-sm text-destructive">{error}</p>}<Button className="w-full" disabled={pending}>{pending ? "Enviando..." : "Confirmar inscrição"}</Button><p className="text-center text-xs text-muted-foreground">A página não exibe a lista de participantes.</p></form>}
      </CardContent></Card>
    </div>
  </main>
}
