import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getPublicEventBySlug } from "@/lib/events/data"
import { PublicEventClient } from "../public-event-client"

type Props = { params: Promise<{ token: string; eventSlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token: companySlug, eventSlug } = await params
  const event = await getPublicEventBySlug(companySlug, eventSlug)
  return event ? {
    title: `${event.title} · ${event.churchName}`,
    description: event.description || `Inscrição para ${event.title}`,
    alternates: { canonical: event.publicPath },
  } : { title: "Evento não encontrado" }
}

export default async function PublicEventPage({ params }: Props) {
  const { token: companySlug, eventSlug } = await params
  const event = await getPublicEventBySlug(companySlug, eventSlug)
  if (!event) notFound()
  return <PublicEventClient event={event} />
}
