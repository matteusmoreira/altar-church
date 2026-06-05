import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function GroupsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "groups", permission: "groups.view" })
  return children
}
