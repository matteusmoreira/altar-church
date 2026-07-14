import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function FormulariosLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "forms", permission: "forms.view" })
  return children
}
