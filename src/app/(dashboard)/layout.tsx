import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { AuthProvider } from "@/lib/auth/context"
import { isPortalRole } from "@/lib/member/access"
import { getOwnWhatsappStatus } from "@/lib/auth/whatsapp-data"

async function getChurchMetadata(companyId?: string | null) {
  const sql = getSql()
  if (!companyId) {
    const rows = await sql<{ name: string; slug: string }[]>`
      select name, slug
      from public.companies
      where active = true
      order by created_at asc
      limit 1
    `
    return {
      name: rows[0]?.name ?? "Altar Church",
      slug: rows[0]?.slug ?? "",
    }
  }
  const rows = await sql<{ name: string; slug: string }[]>`
    select name, slug
    from public.companies
    where id = ${companyId}
    limit 1
  `
  return {
    name: rows[0]?.name ?? "Altar Church",
    slug: rows[0]?.slug ?? "",
  }
}

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (isPortalRole(user.role)) redirect("/membro")
  const [initialEnabledModuleIds, churchMeta, whatsappStatus] = await Promise.all([
    user.role === "superadmin"
      ? Promise.resolve(null)
      : user.churchId
        ? getCompanyEnabledModuleIds(user.churchId)
        : Promise.resolve([] as string[]),
    getChurchMetadata(user.churchId),
    getOwnWhatsappStatus(user),
  ])

  return (
    <AuthProvider initialUser={user}>
      <DashboardLayout
        initialEnabledModuleIds={initialEnabledModuleIds}
        churchName={churchMeta.name}
        churchSlug={churchMeta.slug}
        whatsappPending={whatsappStatus.pending}
      >
        {children}
      </DashboardLayout>
    </AuthProvider>
  )
}
