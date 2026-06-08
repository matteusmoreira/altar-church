import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import type { Permission } from "@/lib/types"

export async function requireExportContext(searchParams: URLSearchParams, permission: Permission) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const requestedCompanyId = searchParams.get("companyId")?.trim() || null
  const companyId = requireUserCompanyId(user, requestedCompanyId)
  await requirePermission(permission, companyId)
  return { user, companyId }
}

export async function auditExport(action: string, entityTable: string, companyId: string) {
  await writeAuditLog({
    action,
    entityTable,
    entityId: companyId,
    companyId,
    metadata: { format: "csv" },
  })
}
