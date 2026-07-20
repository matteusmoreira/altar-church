import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/server"
import { requireDashboardModuleAccess } from "@/lib/auth/page-access"
import { hasPermission } from "@/lib/types"

export default async function VolunteerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (hasPermission(user.role, "volunteers.view")) {
    await requireDashboardModuleAccess({ moduleId: "volunteers", permission: "volunteers.view" })
    return children
  }
  redirect("/membro/voluntariado")
}
