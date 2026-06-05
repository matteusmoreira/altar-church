import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "finance", permission: "finance.view" })
  return children
}
