import "server-only"

import { getSql } from "@/lib/db/client"
import type { User } from "@/lib/types"

export async function getOwnWhatsappStatus(user: User) {
  if (user.role === "superadmin" || !user.churchId) {
    return { pending: false }
  }
  const rows = await getSql()<{ login_phone: string | null }[]>`
    select login_phone
    from public.profiles
    where id = ${user.id}
      and company_id = ${user.churchId}
      and active = true
    limit 1
  `
  return { pending: !rows[0]?.login_phone }
}
