import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function ProgrammingLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "programming" })
  return children
}
