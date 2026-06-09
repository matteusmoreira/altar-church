import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function DonationsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "donations", permission: "donation.view" })
  return children
}
