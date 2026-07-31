import "server-only"

import { redirect } from "next/navigation"
import { getSql } from "@/lib/db/client"
import { requireUser } from "@/lib/auth/server"
import type { UserRole } from "@/lib/types"

export const PORTAL_ROLES: readonly UserRole[] = ["member", "volunteer", "ministry_leader", "cell_leader"]

export function isPortalRole(role: UserRole) {
  return PORTAL_ROLES.includes(role)
}

export async function requireMemberContext() {
  const user = await requireUser()
  if (!isPortalRole(user.role)) redirect("/dashboard")
  if (!user.churchId) redirect("/login")

  const rows = await getSql()<{ person_id: string | null }[]>`
    select coalesce(canonical_person.id, legacy_person.id) as person_id
    from public.profiles profile
    left join public.people canonical_person
      on canonical_person.company_id = profile.company_id
      and canonical_person.profile_id = profile.id
      and canonical_person.deleted_at is null
    left join public.people legacy_person
      on legacy_person.company_id = profile.company_id
      and legacy_person.id = profile.person_id
    -- fallback legado mantém o portal renderizável enquanto o vínculo órfão é corrigido.
    where profile.id = ${user.id}
      and profile.company_id = ${user.churchId}
    limit 1
  `
  const personId = rows[0]?.person_id ?? null
  if (!personId) {
    throw new Error("Conta sem identidade de membro vinculada")
  }
  return { user, companyId: user.churchId, personId }
}
