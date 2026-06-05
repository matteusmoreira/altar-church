import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function SongsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "songs" })
  return children
}
