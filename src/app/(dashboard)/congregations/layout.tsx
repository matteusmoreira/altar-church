import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function CongregationsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "congregations", permission: "members.view" })
  return children
}
