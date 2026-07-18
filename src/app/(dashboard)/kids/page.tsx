import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { hasPermission } from "@/lib/types"
import { getKidsCommunicationData, getKidsDashboardData, getKidsReportsData, getKidsSessionsData } from "@/lib/kids/data"
import type { KidsCommunicationData, KidsReportsData } from "@/lib/kids/types"
import { KidsClient } from "./kids-client"

export default async function KidsPage() {
  const user = await requireDashboardModuleAccess({ moduleId: "kids", permission: "kids.view" })
  const canCommunicate = hasPermission(user.role, "kids.communicate")
  const canViewReports = hasPermission(user.role, "kids.reports.view")

  const [data, sessionsData, communicationData, reportsData] = await Promise.all([
    getKidsDashboardData(),
    getKidsSessionsData(),
    canCommunicate ? getKidsCommunicationData() : Promise.resolve(null as KidsCommunicationData | null),
    canViewReports ? getKidsReportsData() : Promise.resolve(null as KidsReportsData | null),
  ])
  return <KidsClient data={data} sessionsData={sessionsData} communicationData={communicationData} reportsData={reportsData} />
}
