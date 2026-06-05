import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function ReadingPlansLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "reading-plans" })
  return children
}
