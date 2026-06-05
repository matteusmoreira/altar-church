import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "attendance", permission: "attendance.view" })
  return children
}
