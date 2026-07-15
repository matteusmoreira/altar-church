import { requireDashboardModuleAccess } from "@/lib/auth/page-access"

export default async function CellsLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardModuleAccess({ moduleId: "cells" })
  return children
}
