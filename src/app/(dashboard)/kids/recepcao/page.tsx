import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { getKidsReceptionData, getKidsSessionsData } from "@/lib/kids/data"
import { RecepcaoClient } from "./recepcao-client"
import { getKidsSecurityStatus } from "@/lib/kids/security"

export default async function KidsReceptionPage({ searchParams }: { searchParams?: Promise<{ session?: string }> }) {
  await requireDashboardModuleAccess({ moduleId: "kids", permission: "kids.checkin.create" })
  const params = (await searchParams) ?? {}
  const sessionId = params.session?.trim() ?? ""

  const sessionsData = await getKidsSessionsData()
  const openSessions = sessionsData.sessions
    .filter((session) => session.status === "open")
    .map((session) => ({ id: session.id, title: session.title, startsAt: session.startsAt }))

  const selectedId = openSessions.some((session) => session.id === sessionId)
    ? sessionId
    : (openSessions[0]?.id ?? "")

  const data = selectedId ? await getKidsReceptionData(selectedId) : null
  return <RecepcaoClient openSessions={openSessions} selectedSessionId={selectedId} initialData={data} securityStatus={getKidsSecurityStatus()} />
}
