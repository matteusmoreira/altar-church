import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function EventsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "events", permission: "events.view" })
  return children
}
