import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function CommunicationLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "communication", permission: "communication.view" })
  return children
}
