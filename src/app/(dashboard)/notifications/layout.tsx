import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function NotificationsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "notifications", permission: "notification.view" })
  return children
}
