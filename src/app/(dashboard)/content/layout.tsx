import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "content", permission: "content.view" })
  return children
}
