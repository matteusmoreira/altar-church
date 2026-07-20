import "server-only"

import { getSql } from "@/lib/db/client"
import { requireMemberContext } from "@/lib/member/access"

export async function requireVolunteerSelfContext() {
  const context = await requireMemberContext()
  const rows = await getSql()<{ id: string }[]>`
    select volunteer.id
    from public.volunteer_profiles volunteer
    join public.people person
      on person.id = volunteer.person_id
      and person.company_id = volunteer.company_id
      and person.deleted_at is null
      and person.is_active = true
    where volunteer.company_id = ${context.companyId}
      and volunteer.person_id = ${context.personId}
      and volunteer.registration_status = 'active'
      and volunteer.deleted_at is null
    limit 1
  `
  if (!rows[0]?.id) throw new Error("Perfil de voluntário ativo não vinculado")
  return { ...context, volunteerId: rows[0].id }
}
