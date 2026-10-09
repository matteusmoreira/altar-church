"use client"
import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { ExternalEventRegistration } from "@/components/events/external-event-registration"
import { ClientEventQr } from "@/app/(dashboard)/eventos/client-event-qr"
import { toast } from "sonner"
import { rsvpMemberEvent, cancelMemberEventRsvp } from "@/lib/member/portal-actions"
import { eventPriceLabel, type EventRegistrationSettings } from "@/lib/events/contract"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
export function MemberEventRegistration({ event }: { event: EventRegistrationSettings & { id: string; title: string; description: string; timezone: string; location: string; startsAt: string; valueCents: number; valueInstructions: string; status: "going" | "waitlisted" | "canceled" | null; token: string | null; open: boolean } }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const registered = event.status === "going" || event.status === "waitlisted"
  return <Card><CardHeader><CardTitle>{event.title}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="whitespace-pre-wrap text-sm">{event.description}</p><p className="text-sm">{new Date(event.startsAt).toLocaleString("pt-BR", { timeZone: event.timezone })} · {event.location}</p><p className="font-semibold">{eventPriceLabel(event)}{event.registrationMode === "external" && event.valueCents ? " \u00b7 Valor de refer\u00eancia" : ""}</p>{event.valueInstructions && <p className="whitespace-pre-wrap text-sm">{event.valueInstructions}</p>}{event.registrationMode === "external" ? <ExternalEventRegistration event={event} /> : <><p role="status" className="text-sm">{event.status === "going" ? "Inscrição confirmada" : event.status === "waitlisted" ? "Você está na lista de espera" : event.open ? "Inscrições abertas" : "Inscrições encerradas"}</p>{event.status === "going" && event.token && <div className="w-fit rounded-lg bg-white p-4"><ClientEventQr path={`/eventos/check-in/${event.token}`} /></div>}{(registered || event.open) && <Button disabled={pending} onClick={() => startTransition(async () => { const data = new FormData(); data.set("eventId", event.id); const result = registered ? await cancelMemberEventRsvp(data) : await rsvpMemberEvent(data); if (result.ok) { toast.success(registered ? "Inscrição cancelada" : "Inscrição registrada"); router.refresh() } else toast.error(result.error) })}>{pending ? "Salvando..." : registered ? "Cancelar inscrição" : "Inscrever-me"}</Button>}</>}<Button variant="outline" render={<Link href="/membro/agenda" />}>Voltar à agenda</Button></CardContent></Card>
}
