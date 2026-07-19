import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { UazapiInstanceItem, UazapiInstancesData, UazapiInstanceStatus } from "./types"

interface InstanceRow {
  id: string
  provider_instance_id: string
  name: string
  status: UazapiInstanceStatus
  profile_name: string | null
  phone: string | null
  is_default: boolean
  last_checked_at: Date | null
}

export async function getUazapiInstancesData(): Promise<UazapiInstancesData | null> {
  const user = await getCurrentUser()
  if (!user || !["admin", "superadmin"].includes(user.role)) return null

  const companyId = requireUserCompanyId(user)
  const sql = getSql()
  const limits = await sql<{ limit: number }[]>`
    select coalesce(plan.uazapi_instance_limit, 0)::int as limit
    from public.companies company
    left join public.system_plans plan on plan.id = company.plan_id
    where company.id = ${companyId}
    limit 1
  `
  const rows = await sql<InstanceRow[]>`
    select id, provider_instance_id, name, status, profile_name, phone, is_default, last_checked_at
    from public.uazapi_instances
    where company_id = ${companyId} and active = true
    order by is_default desc, created_at
  `

  const instances: UazapiInstanceItem[] = rows.map((row) => ({
    id: row.id,
    providerInstanceId: row.provider_instance_id,
    name: row.name,
    status: row.status,
    profileName: row.profile_name,
    phone: row.phone,
    isDefault: row.is_default,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
  }))

  return { limit: limits[0]?.limit ?? 0, used: instances.length, instances }
}
