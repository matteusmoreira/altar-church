import "server-only"

import { getSql } from "@/lib/db/client"
import type { User } from "@/lib/types"

/** Restringe o papel genérico ministry_leader ao ministério configurado no Kids. */
export async function assertKidsLeaderScope(user: User, companyId: string) {
  if (user.role !== "ministry_leader") return
  const rows = await getSql()<{ allowed: boolean }[]>`
    select exists (
      select 1
      from public.profiles profile
      join public.ministries ministry on ministry.leader_person_id = profile.person_id
        and ministry.company_id = profile.company_id
        and ministry.deleted_at is null
        and ministry.is_active = true
      join public.kid_settings settings on settings.ministry_id = ministry.id
        and settings.company_id = profile.company_id
        and settings.congregation_id is null
      where profile.id = ${user.id}
        and profile.company_id = ${companyId}
        and profile.active = true
    ) as allowed
  `
  if (!rows[0]?.allowed) throw new Error("Acesso restrito ao líder vinculado ao ministério infantil")
}
