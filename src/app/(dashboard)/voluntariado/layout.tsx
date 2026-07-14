import { redirect } from "next/navigation"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireUser } from "@/lib/auth/server"
import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { hasPermission } from "@/lib/types"

export default async function VolunteerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (hasPermission(user.role, "volunteers.view")) {
    await requireDashboardModuleAccess({ moduleId: "volunteers", permission: "volunteers.view" })
    return children
  }
  if (!user.churchId || !hasPermission(user.role, "volunteer.self.view")) redirect("/dashboard?access=denied")
  const enabled = await getCompanyEnabledModuleIds(user.churchId)
  if (!enabled.includes("volunteers")) redirect("/dashboard?access=module-inactive")
  return children
}
