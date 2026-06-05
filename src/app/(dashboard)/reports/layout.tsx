import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "reports", permission: "reports.view" })
  return children
}
