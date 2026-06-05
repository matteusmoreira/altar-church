import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "crm", permission: "crm.view" })
  return children
}
