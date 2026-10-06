import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { MinistryWorkspace } from "@/components/ministries/ministry-workspace"
import { requireMemberContext } from "@/lib/member/access"
import { requireMinistryPermission } from "@/lib/ministries/access"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"

export default async function MemberMinistryManagementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("ministries", identifier)
  if (!route) notFound()
  const id = route.id
  const { companyId } = await requireMemberContext()
  await requireMinistryPermission(id, "ministries.dashboard.view", companyId, { manage: true })
  if (identifier !== route.slug) redirect(canonicalEntityPath("/membro/ministerios", route.slug, await searchParams))
  return <MinistryWorkspace data={await getMinistryWorkspaceData(id, companyId)} initialTab="configuracoes" memberPortal />
}
