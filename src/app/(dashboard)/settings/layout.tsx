import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "settings", permission: "settings.manage_settings" })
  return children
}
