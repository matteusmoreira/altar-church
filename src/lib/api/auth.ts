import type { NextRequest } from "next/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { forbidden, unauthorized } from "@/lib/api/errors"
import type { Permission, User } from "@/lib/types"

export async function requireApiUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    throw unauthorized()
  }
  return user
}

export async function requireApiCompany(requestedCompanyId?: string | null) {
  const user = await requireApiUser()
  const companyId = requireUserCompanyId(user, requestedCompanyId)
  return { user, companyId }
}

export async function requireApiPermission(
  permission: Permission,
  requestedCompanyId?: string | null,
) {
  const { user, companyId } = await requireApiCompany(requestedCompanyId)
  try {
    await requirePermission(permission, companyId)
  } catch {
    throw forbidden()
  }
  return { user, companyId }
}

export async function requireApiSuperadmin() {
  const user = await requireApiUser()
  if (user.role !== "superadmin") {
    throw forbidden("Apenas superadmin")
  }
  return user
}

/** Resolve companyId from query/body and optional permission gate. */
export async function requireApiListContext(
  request: NextRequest,
  permission?: Permission,
) {
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
  if (permission) {
    return requireApiPermission(permission, requestedCompanyId)
  }
  return requireApiCompany(requestedCompanyId)
}
