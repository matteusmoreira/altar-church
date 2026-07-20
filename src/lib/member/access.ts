import "server-only"

import { redirect } from "next/navigation"
import { getSql } from "@/lib/db/client"
import { requireUser } from "@/lib/auth/server"
import type { UserRole } from "@/lib/types"

export const PORTAL_ROLES: readonly UserRole[] = ["member", "volunteer", "ministry_leader"]

export function isPortalRole(role: UserRole) {
  return PORTAL_ROLES.includes(role)
}

export async function requireMemberContext() {
  const user = await requireUser()
  if (!isPortalRole(user.role)) redirect("/dashboard")
  if (!user.churchId) redirect("/login")

  const rows = await getSql()<{ person_id: string | null }[]>`
    select coalesce(profile.person_id, person.id) as person_id
    from public.profiles profile
    left join public.people person
      on person.company_id = profile.company_id
      and person.profile_id = profile.id
      and person.deleted_at is null
    where profile.id = ${user.id}
      and profile.company_id = ${user.churchId}
    limit 1
  `
  const personId = rows[0]?.person_id
  if (!personId) {
    throw new Error("Conta sem identidade de membro vinculada")
  }
  return { user, companyId: user.churchId, personId }
}
