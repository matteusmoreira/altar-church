import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function DashboardHomeLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "dashboard" })
  return children
}
