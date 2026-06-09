import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function VisitorsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "visitors", permission: "visitors.view" })
  return children
}
