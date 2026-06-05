import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "members", permission: "members.view" })
  return children
}
