import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function ChurchInfoLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "church-info", permission: "settings.edit" })
  return children
}
