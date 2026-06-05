import { getCurrentUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { hasPermission, type Permission, type User } from "@/lib/types"

interface AuditLogInput {
  action: string
  entityTable: string
  entityId?: string | null
  companyId?: string | null
  metadata?: Record<string, unknown>
}

function assertAuthenticated(user: User | null): asserts user is User {
  if (!user) {
    throw new Error("Acesso negado")
  }
}

export async function requireCompanyAccess(companyId?: string | null) {
  const user = await getCurrentUser()
  assertAuthenticated(user)

  if (user.role === "superadmin") {
    return user
  }

  if (!companyId || user.churchId !== companyId) {
    throw new Error("Acesso negado")
  }

  return user
}

export async function requirePermission(permission: Permission, companyId?: string | null) {
  const user = await requireCompanyAccess(companyId)

  if (!hasPermission(user.role, permission)) {
    throw new Error("Acesso negado")
  }

  return user
}

export async function writeAuditLog(input: AuditLogInput) {
  const user = await getCurrentUser()
  assertAuthenticated(user)

  const companyId = input.companyId ?? user.churchId ?? null
  if (user.role !== "superadmin" && (!companyId || companyId !== user.churchId)) {
    throw new Error("Acesso negado")
  }

  const sql = getSql()
  const metadata = JSON.stringify(input.metadata ?? {})
  await sql`
    insert into public.audit_logs (
      company_id,
      actor_profile_id,
      action,
      entity_table,
      entity_id,
      metadata
    )
    values (
      ${companyId},
      ${user.id},
      ${input.action},
      ${input.entityTable},
      ${input.entityId ?? null},
      ${metadata}::jsonb
    )
  `
}
