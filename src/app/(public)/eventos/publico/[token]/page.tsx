import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getPublicEventByToken } from "@/lib/events/data"
import { canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"

type PageProps = { params: Promise<{ token: string }>; searchParams: Promise<RouteSearchParams> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params
  const event = await getPublicEventByToken(token)
  return event ? { title: `${event.title} · ${event.churchName}`, description: event.description || `Inscrição para ${event.title}` } : { title: "Evento não encontrado" }
}

export default async function PublicEventPage({ params, searchParams }: PageProps) {
  const { token } = await params
  const event = await getPublicEventByToken(token)
  if (!event) notFound()
  const split = event.publicPath.lastIndexOf("/")
  redirect(canonicalEntityPath(event.publicPath.slice(0, split), event.publicPath.slice(split + 1), await searchParams))
}
