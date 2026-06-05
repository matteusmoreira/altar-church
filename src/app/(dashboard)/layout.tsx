import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { requireUser } from "@/lib/auth/server"

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  await requireUser()

  return <DashboardLayout>{children}</DashboardLayout>
}
