import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function MinistriesLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "ministries", permission: "ministries.view" })
  return children
}
