import "server-only"

import { getSql } from "@/lib/db/client"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import type { User } from "@/lib/types"

export async function resolveVolunteerContext(): Promise<{
  user: User
  companyId: string
  personId: string
} | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const companyId = user.churchId ?? (user.role === "superadmin" ? requireUserCompanyId(user) : null)
  if (!companyId) return null

  const sql = getSql()
  const personRows = await sql<{ person_id: string | null }[]>`
    select coalesce(canonical_person.id, legacy_person.id) as person_id
    from public.profiles profile
    left join public.people canonical_person
      on canonical_person.company_id = profile.company_id
      and canonical_person.profile_id = profile.id
      and canonical_person.deleted_at is null
    left join public.people legacy_person
      on legacy_person.company_id = profile.company_id
      and legacy_person.id = profile.person_id
    where profile.id = ${user.id}
      and profile.company_id = ${companyId}
    limit 1
  `
  const personId = personRows[0]?.person_id ?? null
  if (!personId) return null
  return { user, companyId, personId }
}

export async function getVolunteerSelfContext() {
  const context = await resolveVolunteerContext()
  if (!context) return null

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
  if (!rows[0]?.id) return null
  return { ...context, volunteerId: rows[0].id }
}

export async function requireVolunteerSelfContext() {
  const context = await getVolunteerSelfContext()
  if (!context) throw new Error("Perfil de voluntário ativo não vinculado")
  return context
}
