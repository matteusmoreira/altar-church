import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function MinistriesLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id?: string }> }) {
  const { id } = await params
  if (id) {
    await requireDashboardModuleAccess({ moduleId: "ministries", permission: "ministries.dashboard.view" })
  } else {
    await requireDashboardModuleAccess({ moduleId: "ministries", permission: "ministries.view" })
  }
  return children
}
