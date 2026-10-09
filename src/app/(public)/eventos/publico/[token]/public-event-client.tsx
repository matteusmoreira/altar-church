"use client"
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowDown, CalendarDays, CheckCircle2, Church, Clock3, Globe, MapPin, Users } from "lucide-react"
import { cancelGuestEventRegistration, registerGuestForEvent } from "@/lib/events/actions"
import type { EventPublicData, EventPublicRegistration } from "@/lib/events/types"
import { eventTypeLabel } from "@/lib/events/presentation"
import { eventPriceLabel } from "@/lib/events/contract"
import { ExternalEventRegistration } from "@/components/events/external-event-registration"
import { AcquisitionBeacon } from "@/components/public/acquisition-beacon"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function formatDate(value: string, timeZone = "America/Sao_Paulo") {
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "full", timeStyle: "short" }).format(new Date(value))
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

  const date = new Date(event.startsAt)
  const timezone = event.timezone || "America/Sao_Paulo"
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, day: "2-digit" }).format(date)
  const month = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, month: "short" }).format(date).replace(".", "")
  return <main className="min-h-screen bg-background text-foreground">
    <AcquisitionBeacon companySlug={event.companySlug} />
    <header className="border-b bg-card/80"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-8"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Church className="h-5 w-5" /></span><div className="min-w-0"><p className="break-words text-sm font-semibold">{event.churchName}</p><p className="text-xs text-muted-foreground">Um encontro para viver juntos</p></div></div><ThemeToggle /></div></header>
    <section className="relative isolate overflow-hidden bg-slate-950">
      {event.bannerUrl ? <><img src={event.bannerUrl} alt={`Capa de ${event.title}`} className="absolute inset-0 -z-20 h-full w-full object-cover opacity-55" /><div className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" /></> : <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#2563eb55,transparent_65%)]" />}
      <div className="mx-auto flex min-h-[360px] max-w-7xl flex-col justify-end gap-6 px-4 py-10 sm:min-h-[460px] sm:px-8 sm:py-14 lg:py-20">
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">{eventTypeLabel(event.type)}</span><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white backdrop-blur">{event.isOnline ? "Encontro online" : "Encontro presencial"}</span></div>
        <h1 className="max-w-4xl break-words text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">{event.title}</h1>
        <div className="flex flex-col gap-3 text-sm text-slate-200 sm:flex-row sm:flex-wrap sm:gap-x-6"><p className="flex items-start gap-2"><CalendarDays className="h-5 w-5 shrink-0 text-blue-300" />{formatDate(event.startsAt, timezone)}</p><p className="flex min-w-0 items-start gap-2"><MapPin className="h-5 w-5 shrink-0 text-blue-300" /><span className="break-words">{event.isOnline ? "Evento online" : event.location || "Local a confirmar"}</span></p></div>
        <div><a href="#participar" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-blue-50">{event.registrationMode === "external" ? "Ver ingressos" : event.registrationEnabled && event.registrationOpen ? "Quero participar" : "Informações de participação"}<ArrowDown className="h-4 w-4" /></a></div>
      </div>
    </section>
    <div className="mx-auto grid max-w-7xl items-start gap-8 px-4 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
      <div className="min-w-0 space-y-8">
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-4 sm:p-6"><div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary/10 text-primary"><span className="text-3xl font-semibold">{day}</span><span className="text-xs font-semibold uppercase tracking-widest">{month}</span></div><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Reserve esta data</p><p className="mt-1 break-words font-semibold">{formatDate(event.startsAt, timezone)}</p>{event.endsAt && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" />Até {new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(event.endsAt))}</p>}</div></div>
        <section><h2 className="text-2xl font-semibold tracking-tight">Sobre o evento</h2><p className="mt-4 whitespace-pre-wrap break-words text-base leading-8 text-muted-foreground">{event.description || "Você é nosso convidado. Venha participar deste encontro e compartilhar um momento especial com nossa comunidade."}</p></section>
        {event.bannerUrl && <img src={event.bannerUrl} alt={`Arte do evento ${event.title}`} loading="lazy" className="max-h-[540px] w-full rounded-2xl border bg-muted object-contain" />}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5"><MapPin className="mb-4 h-6 w-6 text-primary" /><h2 className="font-semibold">{event.isOnline ? "Acesso online" : "Local do encontro"}</h2><p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{event.isOnline ? "Participe de onde estiver, pelo link do encontro." : event.location || "Local a confirmar"}</p>{event.isOnline && event.onlineLink && <a className="mt-3 inline-block break-all text-sm font-medium text-primary underline underline-offset-4" href={event.onlineLink} target="_blank" rel="noreferrer"><Globe className="mr-1 inline h-4 w-4" />Acessar encontro</a>}</div>
          <div className="rounded-2xl border bg-card p-5"><Users className="mb-4 h-6 w-6 text-primary" /><h2 className="font-semibold">Participação</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{event.registrationMode === "external" ? `Garanta sua participação pelo ${event.externalPlatform}.` : event.capacityRemaining === 0 ? "Vagas preenchidas. Você pode entrar na lista de espera." : event.maxCapacity > 0 ? `${event.capacityRemaining} vagas disponíveis. Reserve a sua presença.` : "Venha fazer parte deste encontro."}</p></div>
        </section>
      </div>
      <aside id="participar" className="min-w-0 scroll-mt-6 space-y-5 lg:sticky lg:top-6">
        <div className="rounded-2xl border bg-primary/5 p-5"><p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{event.registrationMode === "external" ? "Ingressos e valores" : "Investimento"}</p><p className="mt-2 break-words text-2xl font-semibold text-primary">{eventPriceLabel(event)}</p>{event.valueInstructions && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{event.valueInstructions}</p>}<p className="mt-3 text-xs leading-5 text-muted-foreground">{event.registrationMode === "external" ? "Consulte valores e condições na plataforma externa." : event.valueCents ? "Valor informado pela organização. A inscrição não realiza cobrança." : "Participação gratuita."}</p></div>
      {event.registrationMode !== "external" && event.registrationFormSlug && <Card className="overflow-hidden rounded-2xl shadow-lg"><CardHeader><h2 className="text-lg font-semibold">Formulário complementar</h2><CardDescription>{event.registrationFormTitle ?? "Preencha o formulário da igreja"}</CardDescription></CardHeader><CardContent><Button nativeButton={false} render={<a href={`/f/${event.companySlug}/${event.registrationFormSlug}`} />} className="w-full">Abrir formulário</Button></CardContent></Card>}

      {event.registrationMode === "external" ? <Card className="overflow-hidden rounded-2xl shadow-lg"><CardHeader><h2 className="text-lg font-semibold">Ingressos</h2></CardHeader><CardContent><ExternalEventRegistration event={event} /></CardContent></Card> : <Card className="overflow-hidden rounded-2xl shadow-lg"><CardHeader><h2 className="text-lg font-semibold">{registration ? registration.status === "waitlisted" ? "Lista de espera" : "Inscrição confirmada" : !event.registrationEnabled || !event.registrationOpen ? "Inscrições indisponíveis" : event.capacityRemaining === 0 ? "Entrar na lista de espera" : "Inscreva-se"}</h2><CardDescription>{registration ? "Guarde este comprovante. Ele também permite cancelar sua inscrição." : event.registrationEnabled && event.registrationOpen ? `Preencha seus dados para entrar na ${registrationLabel}.` : "Confira as informações do evento."}</CardDescription></CardHeader><CardContent>
        {!registration && (!event.registrationEnabled || !event.registrationOpen) ? <p className="rounded-lg border p-4 text-sm">{!event.registrationEnabled ? "Este evento não recebe inscrições." : "As inscrições deste evento foram encerradas."}</p> : registration ? <div className="space-y-4 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"><CheckCircle2 className="h-7 w-7" /></div><div><p className="font-semibold">{registration.fullName}</p><p className="text-sm text-muted-foreground">{registration.status === "waitlisted" ? "Você está na lista de espera." : "Sua presença foi reservada."}</p></div><Button nativeButton={false} render={<Link href={`/eventos/inscricao/${registration.token}`} />} variant="outline">Abrir comprovante</Button>{!canceled ? <Button variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = await cancelGuestEventRegistration(registration.token); if (result.ok) setCanceled(true); else setError(result.error ?? "Não foi possível cancelar") })}>{pending ? "Cancelando..." : "Cancelar inscrição"}</Button> : <p className="text-sm text-muted-foreground">Inscrição cancelada.</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div> : <form className="space-y-4" onSubmit={submit}><div className="grid gap-2"><Label htmlFor="event-full-name">Nome completo</Label><Input id="event-full-name" autoComplete="name" maxLength={200} value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="event-email">E-mail</Label><Input id="event-email" autoComplete="email" maxLength={240} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional se informar telefone" /></div><div className="grid gap-2"><Label htmlFor="event-phone">Telefone</Label><Input id="event-phone" autoComplete="tel" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="opcional se informar e-mail" /></div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>Autorizo o uso destes dados para confirmar e acompanhar minha inscrição neste evento.</span></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="min-h-12 w-full" disabled={pending}>{pending ? "Enviando..." : "Confirmar inscrição"}</Button><p className="text-center text-xs text-muted-foreground">A página não exibe a lista de participantes.</p></form>}
      </CardContent></Card>}
      </aside>
    </div>
    <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground">Organizado por {event.churchName} · Altar Church</footer>
  </main>
}
