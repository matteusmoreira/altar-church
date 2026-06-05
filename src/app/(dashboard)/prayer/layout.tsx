import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function PrayerLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "prayer", permission: "prayer.view" })
  return children
}
