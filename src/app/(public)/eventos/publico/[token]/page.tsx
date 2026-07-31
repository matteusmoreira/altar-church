import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicEventByToken } from "@/lib/events/data"
import { PublicEventClient } from "./public-event-client"

type PageProps = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const event = await getPublicEventByToken(token)
  return event ? { title: `${event.title} · ${event.churchName}`, description: event.description || `Inscrição para ${event.title}` } : { title: "Evento não encontrado" }
}

export default async function PublicEventPage({ params }: PageProps) {
  const { token } = await params
  const event = await getPublicEventByToken(token)
  if (!event) notFound()
  return <PublicEventClient event={event} />
}
