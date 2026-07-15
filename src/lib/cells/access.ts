import "server-only"

import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { Permission, User } from "@/lib/types"

export type CellContext = {
  user: User
  companyId: string
  personId: string | null
}

export async function getCellContext(companyIdInput?: string | null): Promise<CellContext> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  const rows = await getSql()<{ person_id: string | null }[]>`
    select coalesce(profile.person_id, person.id) as person_id
    from public.profiles profile
    left join public.people person on person.profile_id = profile.id and person.deleted_at is null
    where profile.id = ${user.id}
    limit 1
  `
  return { user, companyId, personId: rows[0]?.person_id ?? null }
}

export async function requireCellPermission(permission: Permission, companyIdInput?: string | null) {
  const context = await getCellContext(companyIdInput)
  await requirePermission(permission, context.companyId)
  return context
}

export function isCellAdministrator(user: User) {
  return user.role === "superadmin" || user.role === "admin"
}

export async function canManageCell(context: CellContext, groupId: string) {
  if (isCellAdministrator(context.user)) return true
  if (!context.personId || !["cell_supervisor", "cell_leader"].includes(context.user.role)) return false
  const rows = await getSql()<{ allowed: boolean }[]>`
    select exists(
      select 1 from public.groups cell
      where cell.id = ${groupId}
        and cell.company_id = ${context.companyId}
        and cell.type = 'cell'
        and cell.deleted_at is null
        and (
          (${context.user.role} = 'cell_supervisor' and cell.coordinator_person_id = ${context.personId})
          or (${context.user.role} = 'cell_leader' and cell.leader_person_id = ${context.personId})
        )
    ) as allowed
  `
  return Boolean(rows[0]?.allowed)
}

export async function requireManagedCell(context: CellContext, groupId: string) {
  if (!(await canManageCell(context, groupId))) throw new Error("Você não pode gerenciar esta célula")
}

export async function isActiveCellParticipant(context: CellContext, groupId: string) {
  if (!context.personId) return false
  const rows = await getSql()<{ allowed: boolean }[]>`
    select exists(
      select 1 from public.group_members member
      join public.groups cell on cell.id = member.group_id
      where member.group_id = ${groupId}
        and member.person_id = ${context.personId}
        and member.company_id = ${context.companyId}
        and member.status = 'active'
        and cell.type = 'cell'
        and cell.deleted_at is null
    ) as allowed
  `
  return Boolean(rows[0]?.allowed)
}

export async function requireCellParticipant(context: CellContext, groupId: string) {
  if (!(await isActiveCellParticipant(context, groupId))) throw new Error("Você não participa desta célula")
}

