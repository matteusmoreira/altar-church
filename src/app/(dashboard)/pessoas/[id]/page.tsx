import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { MemberDetailClient } from "./member-detail-client"
import { getPersonDetail, getPersonFormOptions } from "@/lib/people/data"
import { listFollowUpResponsibleOptions } from "@/lib/people/follow-up"
import { requireUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"

type PageParams = {
  id: string
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<RouteSearchParams>
}) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("people", identifier)
  if (!route) notFound()
  const id = route.id
  const [person, formOptions, responsibleOptions, user] = await Promise.all([
    getPersonDetail(id),
    getPersonFormOptions(),
    listFollowUpResponsibleOptions(),
    requireUser(),
  ])

  if (!person) {
    notFound()
  }

  if (identifier !== route.slug) redirect(canonicalEntityPath("/pessoas", route.slug, await searchParams))
  return (
    <MemberDetailClient
      person={person}
      cells={formOptions.cells}
      responsibleOptions={responsibleOptions}
      canManageKids={hasPermission(user, "kids.children.manage")}
    />
  )
}
