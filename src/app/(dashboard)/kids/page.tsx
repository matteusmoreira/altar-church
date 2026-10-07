import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { getKidsDashboardData } from "@/lib/kids/data"
import { KidsClient } from "./kids-client"
import { getKidsSecurityStatus } from "@/lib/kids/security"
import { hasPermission } from "@/lib/types"
import type { KidsCapabilities } from "@/lib/kids/types"

export default async function KidsPage() {
  const user = await requireDashboardModuleAccess({ moduleId: "kids", permission: "kids.view" })
  const data = await getKidsDashboardData()
  const capabilities: KidsCapabilities = {
    view: hasPermission(user, "kids.view"),
    manageChildren: hasPermission(user, "kids.children.manage"),
    manageGuardians: hasPermission(user, "kids.guardians.manage"),
    manageClasses: hasPermission(user, "kids.classes.manage"),
    manageSessions: hasPermission(user, "kids.sessions.manage"),
    viewHealth: hasPermission(user, "kids.health.view"),
    communicate: hasPermission(user, "kids.communicate"),
    viewReports: hasPermission(user, "kids.reports.view"),
    manageSettings: hasPermission(user, "kids.settings.manage"),
  }
  return <KidsClient data={data} capabilities={capabilities} securityStatus={getKidsSecurityStatus()} />
}
