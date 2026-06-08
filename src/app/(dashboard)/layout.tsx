import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireUser } from "@/lib/auth/server"

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const initialEnabledModuleIds =
    user.role === "superadmin"
      ? null
      : user.churchId
        ? await getCompanyEnabledModuleIds(user.churchId)
        : []

  return <DashboardLayout initialEnabledModuleIds={initialEnabledModuleIds}>{children}</DashboardLayout>
}
