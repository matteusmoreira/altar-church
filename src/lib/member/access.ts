import "server-only"

import { redirect } from "next/navigation"
import { getSql } from "@/lib/db/client"
import { requireUser } from "@/lib/auth/server"

export async function requireMemberContext() {
  const user = await requireUser()
  if (user.role !== "member") {
    if (user.role === "volunteer") redirect("/voluntariado")
    redirect("/dashboard")
  }
  if (!user.churchId) redirect("/login")

  const rows = await getSql()<{ person_id: string | null }[]>`
    select coalesce(profile.person_id, person.id) as person_id
    from public.profiles profile
    left join public.people person
      on person.profile_id = profile.id and person.deleted_at is null
    where profile.id = ${user.id}
    limit 1
  `
  const personId = rows[0]?.person_id
  if (!personId) {
    throw new Error("Conta sem identidade de membro vinculada")
  }
  return { user, companyId: user.churchId, personId }
}
