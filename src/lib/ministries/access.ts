import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { Permission, User } from "@/lib/types"

const ADMIN_ROLES = new Set(["superadmin", "admin", "pastor"])

export interface MinistryAccess {
  user: User
  companyId: string
  ministryId: string
  personId: string | null
  membershipRole: "member" | "leader" | "coordinator" | null
  canManage: boolean
}

export async function resolveMinistryAccess(ministryId: string, companyIdInput?: string | null): Promise<MinistryAccess> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  const sql = getSql()
  const [ministryRows, profileRows] = await Promise.all([
    sql<{ id: string }[]>`
      select id from public.ministries
      where id = ${ministryId} and company_id = ${companyId} and deleted_at is null
      limit 1
    `,
    sql<{ person_id: string | null }[]>`select person_id from public.profiles where id = ${user.id} limit 1`,
  ])
  if (!ministryRows[0]) throw new Error("Ministério não encontrado")
  const personId = profileRows[0]?.person_id ?? null
  const isAdmin = ADMIN_ROLES.has(user.role)
  const memberships = personId
    ? await sql<{ role: "member" | "leader" | "coordinator" }[]>`
        select role from public.ministry_memberships
        where ministry_id = ${ministryId} and company_id = ${companyId}
          and person_id = ${personId} and status = 'active' and left_at is null
        order by case role when 'leader' then 1 when 'coordinator' then 2 else 3 end
        limit 1
      `
    : []
  const membershipRole = memberships[0]?.role ?? null
  if (!isAdmin && !membershipRole) throw new Error("Você não pertence a este ministério")
  return {
    user,
    companyId,
    ministryId,
    personId,
    membershipRole,
    canManage: isAdmin || membershipRole === "leader" || membershipRole === "coordinator",
  }
}

export async function requireMinistryPermission(
  ministryId: string,
  permission: Permission,
  companyIdInput?: string | null,
  options: { manage?: boolean } = {},
) {
  const access = await resolveMinistryAccess(ministryId, companyIdInput)
  await requirePermission(permission, access.companyId)
  if (options.manage && !access.canManage) throw new Error("Acesso de gestão negado")
  return access
}

export function isMinistryAdmin(user: User) {
  return ADMIN_ROLES.has(user.role)
}
