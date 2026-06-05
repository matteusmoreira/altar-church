import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function InpeacePlayLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "inpeace-play", permission: "subscription.view" })
  return children
}
