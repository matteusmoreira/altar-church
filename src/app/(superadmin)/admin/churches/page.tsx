import { SuperAdminConsole } from "@/components/admin/superadmin-console"
import { getAdminDashboardData } from "@/lib/admin/data"

export default async function AdminChurchesPage() {
  const data = await getAdminDashboardData()

  return <SuperAdminConsole initialData={data} initialTab="companies" />
}
