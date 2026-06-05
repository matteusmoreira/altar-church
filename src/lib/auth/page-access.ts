import { redirect } from "next/navigation"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { getCurrentUser } from "@/lib/auth/server"
import { hasPermission, type Permission, type User } from "@/lib/types"

interface DashboardModuleAccessInput {
  moduleId: string
  permission?: Permission
}

export async function requireDashboardModuleAccess(input: DashboardModuleAccessInput): Promise<User> {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  if (user.role === "superadmin") {
    return user
  }

  if (!user.churchId) {
    redirect("/dashboard?access=denied")
  }

  if (input.moduleId !== "dashboard") {
    const enabledModuleIds = await getCompanyEnabledModuleIds(user.churchId)
    if (!enabledModuleIds.includes(input.moduleId)) {
      redirect("/dashboard?access=module-inactive")
    }
  }

  const { permission } = input
  if (permission && !hasPermission(user.role, permission)) {
    redirect("/dashboard?access=denied")
  }

  return user
}
