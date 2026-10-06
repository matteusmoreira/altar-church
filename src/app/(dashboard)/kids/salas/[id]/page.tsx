import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { Baby } from "lucide-react"
import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { getKidRoomPanelData } from "@/lib/kids/data"
import type { KidRoomPanelData } from "@/lib/kids/types"
import { SalaClient } from "./sala-client"

export default async function KidRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<RouteSearchParams> }) {
  await requireDashboardModuleAccess({ moduleId: "kids", permission: "kids.room.view" })
  const { id: identifier } = await params
  const route = await resolveEntityRoute("rooms", identifier)
  if (!route) notFound()
  const id = route.id

  let data: KidRoomPanelData | null = null
  try {
    data = await getKidRoomPanelData(id)
  } catch {
    data = null
  }

  if (!data) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <div className="max-w-md rounded-lg border border-border/40 p-6 text-center">
          <Baby className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Sala não disponível</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não está escalado nesta sala ou ela não existe. Fale com a liderança do Kids.
          </p>
        </div>
      </div>
    )
  }

  if (identifier !== route.slug) redirect(canonicalEntityPath("/kids/salas", route.slug, await searchParams))
  return <SalaClient data={data} />
}
