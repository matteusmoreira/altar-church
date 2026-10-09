import Link from "next/link"
import { notFound } from "next/navigation"
import { getMyInboxSubject, getMyInboxKidsDetails, getMyInboxEventDetails, getMyInboxVolunteerDetails } from "@/lib/notifications/inbox"
import { getCurrentUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"
import { ShiftChat } from "@/app/(dashboard)/voluntariado/volunteer-v2-workspace"
import { NotificationBell } from "@/components/notifications/notification-bell"
export const dynamic = "force-dynamic"
export default async function NotificationSubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getMyInboxSubject(id).catch(() => null)
  if (!item || (!item.kind.startsWith("event.") && item.kind !== "volunteer.registration" && !["shift","kids"].includes(item.scope_kind))) notFound()
  const volunteer = item.kind === "volunteer.registration" ? await getMyInboxVolunteerDetails(id) : null
  const event = item.kind.startsWith("event.") ? await getMyInboxEventDetails(id) : null
  const kids = item.scope_kind === "kids" ? await getMyInboxKidsDetails(id) : null
  const user = kids ? await getCurrentUser() : null
  const date = (value: string) => new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(value))
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 p-4 sm:p-8"><div className="flex items-center justify-between gap-3"><Link href="/" className="text-sm text-primary underline">Voltar ao sistema</Link><NotificationBell /></div><h1 className="text-2xl font-bold">{item.title}</h1><p className="text-muted-foreground">{item.summary}</p>
    {item.scope_kind === "shift" && item.scope_id && <ShiftChat shiftId={item.scope_id} unreadCount={0} initialOpen />}
    {volunteer && <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{volunteer.name}</h2><p>Situação: {({pending:"Em análise",active:"Aprovado",inactive:"Inativo",suspended:"Suspenso"} as Record<string,string>)[volunteer.status] || "Em análise"}</p></section>}
    {event && <section className="space-y-3 rounded-xl border p-4"><h2 className="font-semibold">{event.title}</h2>{["canceled","cancelled"].includes(event.status) && <p className="font-semibold text-destructive">Evento cancelado</p>}<p className="text-sm">{date(event.startsAt)}{event.endsAt ? ` até ${date(event.endsAt)}` : ""}</p><p className="text-sm">{event.location || "Local não informado"}</p><p className="whitespace-pre-wrap text-sm">{event.description}</p>{!["canceled","cancelled"].includes(event.status) && <Link className="text-sm text-primary underline" href={`/membro/agenda?event=${event.id}`}>Ver na agenda</Link>}</section>}
    {kids && <section className="space-y-4 rounded-xl border p-4">
      {kids.session && <><h2 className="font-semibold">{kids.session.title}</h2><p>{kids.session.status === "cancelled" ? "Sessão cancelada" : "Programação Kids"}</p>{kids.session.startsAt && <p className="text-sm">{date(kids.session.startsAt)}{kids.session.endsAt ? ` até ${date(kids.session.endsAt)}` : ""}</p>}</>}
      {kids.description && <p className="whitespace-pre-wrap text-sm">{kids.description}</p>}
      {kids.messages.map(message=><article key={message.id} className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{message.senderName} · {date(message.createdAt)}</p><p className="mt-1 whitespace-pre-wrap break-words">{message.body}</p></article>)}
      {user && hasPermission(user,"kids.view") && <Link className="text-sm text-primary underline" href={`/kids?tab=${item.kind === "chat.message" ? "comunicacao" : "sessoes"}`}>Abrir painel Kids</Link>}
    </section>}
  </main>
}
