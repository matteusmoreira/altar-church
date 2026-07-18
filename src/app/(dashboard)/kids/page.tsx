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
    view: hasPermission(user.role, "kids.view"),
    manageChildren: hasPermission(user.role, "kids.children.manage"),
    manageGuardians: hasPermission(user.role, "kids.guardians.manage"),
    manageClasses: hasPermission(user.role, "kids.classes.manage"),
    manageSessions: hasPermission(user.role, "kids.sessions.manage"),
    viewHealth: hasPermission(user.role, "kids.health.view"),
    communicate: hasPermission(user.role, "kids.communicate"),
    viewReports: hasPermission(user.role, "kids.reports.view"),
    manageSettings: hasPermission(user.role, "kids.settings.manage"),
  }
  return <KidsClient data={data} capabilities={capabilities} securityStatus={getKidsSecurityStatus()} />
}
