import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"
import { MinistryWorkspace } from "@/components/ministries/ministry-workspace"

export default async function MinistryWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("ministries", identifier)
  if (!route) notFound()
  const id = route.id
  let data
  try {
    data = await getMinistryWorkspaceData(id)
  } catch (error) {
    if (error instanceof Error && /acesso|pertence|não encontrado|nao encontrado/i.test(error.message)) redirect("/dashboard?access=denied")
    throw error
  }
  // Se acessado por ID (UUID) ou slug diferente e o ministério tiver slug amigável,
  // redireciona para a rota com slug canônico
  const friendlySlug = data.workspace.profile.slug
  if (friendlySlug && identifier !== friendlySlug) {
    redirect(canonicalEntityPath("/ministerios", friendlySlug, await searchParams))
  }

  return <MinistryWorkspace data={data} />
}
