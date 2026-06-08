import { redirect } from "next/navigation"
import { getSql } from "@/lib/db/client"
import type { User, UserRole } from "@/lib/types"
import { createClient } from "@/lib/supabase/server"

interface ProfileRow {
  id: string
  auth_user_id: string | null
  company_id: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  avatar_url: string | null
  created_at: Date
}

function toUser(profile: ProfileRow): User {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    avatar: profile.avatar_url ?? undefined,
    churchId: profile.company_id ?? undefined,
    createdAt: profile.created_at.toISOString(),
  }
}

async function getProfileForAuthUser(authUserId: string, email?: string | null) {
  const sql = getSql()
  const rows = await sql<ProfileRow[]>`
    select
      p.id,
      p.auth_user_id,
      coalesce(
        p.company_id,
        case
          when p.role = 'superadmin' then (
            select c.id
            from public.companies c
            where c.active = true
            order by c.created_at, c.id
            limit 1
          )
        end
      ) as company_id,
      p.name,
      p.email,
      p.role,
      p.active,
      p.avatar_url,
      p.created_at
    from public.profiles p
    where p.active = true
      and (
        p.auth_user_id = ${authUserId}
        or (${email ?? ""} <> '' and lower(p.email) = lower(${email ?? ""}) and p.auth_user_id is null)
      )
    order by p.auth_user_id nulls last
    limit 1
  `

  const profile = rows[0] ?? null

  if (profile && !profile.auth_user_id) {
    await sql`
      update public.profiles
      set auth_user_id = ${authUserId}
      where id = ${profile.id}
        and auth_user_id is null
    `
    profile.auth_user_id = authUserId
  }

  return profile
}

export function requireUserCompanyId(user: User, requestedCompanyId?: string | null) {
  const companyId = user.role === "superadmin" ? requestedCompanyId ?? user.churchId : user.churchId
  if (!companyId) {
    throw new Error("Igreja obrigatória")
  }
  return companyId
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser()

  if (error || !authUser) return null

  const profile = await getProfileForAuthUser(authUser.id, authUser.email)
  if (!profile) return null

  return toUser(profile)
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export async function requireSuperadmin() {
  const user = await requireUser()
  if (user.role !== "superadmin") redirect("/dashboard")
  return user
}

export async function assertSuperadmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "superadmin") {
    throw new Error("Acesso restrito ao SuperAdmin")
  }
  return user
}
