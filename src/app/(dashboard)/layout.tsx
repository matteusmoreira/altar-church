import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { AuthProvider } from "@/lib/auth/context"

async function getChurchDisplayName(companyId?: string | null) {
  if (!companyId) return "Altar Church"
  const rows = await getSql()<{ name: string }[]>`
    select name
    from public.companies
    where id = ${companyId}
    limit 1
  `
  return rows[0]?.name ?? "Altar Church"
}

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  // Responsável (guardian) nunca acessa o dashboard administrativo: vai para o portal da família.
  if (user.role === "guardian") {
    redirect("/familia/kids")
  }
  const [initialEnabledModuleIds, churchName] = await Promise.all([
    user.role === "superadmin"
      ? Promise.resolve(null)
      : user.churchId
        ? getCompanyEnabledModuleIds(user.churchId)
        : Promise.resolve([] as string[]),
    getChurchDisplayName(user.churchId),
  ])

  return (
    <AuthProvider initialUser={user}>
      <DashboardLayout initialEnabledModuleIds={initialEnabledModuleIds} churchName={churchName}>
        {children}
      </DashboardLayout>
    </AuthProvider>
  )
}
