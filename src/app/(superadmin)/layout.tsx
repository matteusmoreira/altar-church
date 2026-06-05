import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { requireSuperadmin } from "@/lib/auth/server"

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperadmin()

  return <DashboardLayout>{children}</DashboardLayout>
}
