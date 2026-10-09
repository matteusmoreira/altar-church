import { redirect } from "next/navigation"
import { DashboardLayout } from "@/components/layout/dashboard-layout"
import { getCompanyEnabledModuleIds } from "@/lib/admin/data"
import { requireUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { AuthProvider } from "@/lib/auth/context"
import { isPortalRole } from "@/lib/member/access"
import { getOwnWhatsappStatus } from "@/lib/auth/whatsapp-data"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"

interface ChurchMetadataRow {
  name: string
  slug: string
  logo_storage_path: string | null
}

async function getChurchMetadata(companyId?: string | null) {
  const sql = getSql()
  let rows: ChurchMetadataRow[] = []

  if (!companyId) {
    rows = await sql<ChurchMetadataRow[]>`
      select
        coalesce(nullif(cp.public_name, ''), c.name) as name,
        c.slug,
        logo.storage_path as logo_storage_path
      from public.companies c
      left join public.church_profiles cp on cp.company_id = c.id
      left join public.app_files logo on logo.id = cp.logo_file_id
      where c.active = true
      order by c.created_at asc
      limit 1
    `
  } else {
    rows = await sql<ChurchMetadataRow[]>`
      select
        coalesce(nullif(cp.public_name, ''), c.name) as name,
        c.slug,
        logo.storage_path as logo_storage_path
      from public.companies c
      left join public.church_profiles cp on cp.company_id = c.id
      left join public.app_files logo on logo.id = cp.logo_file_id
      where c.id = ${companyId}
      limit 1
    `
  }

  const row = rows[0]
  let logoUrl: string | null = null
  if (row?.logo_storage_path) {
    try {
      const signedUrls = await createSignedUrlsByStoragePath([row.logo_storage_path], 60 * 60 * 24 * 7)
      logoUrl = signedUrls.get(row.logo_storage_path) ?? null
    } catch {
      // Ignora erro de storage
    }
  }

  return {
    name: row?.name ?? "Altar Church",
    slug: row?.slug ?? "",
    logoUrl,
  }
}

export default async function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (isPortalRole(user.role) && !(user.roles ?? [user.role]).some(role => !isPortalRole(role))) redirect("/membro")
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
        churchLogoUrl={churchMeta.logoUrl}
        whatsappPending={whatsappStatus.pending}
      >
        {children}
      </DashboardLayout>
    </AuthProvider>
  )
}
