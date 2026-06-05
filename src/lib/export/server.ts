import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser } from "@/lib/auth/server"
import type { Permission } from "@/lib/types"

export async function requireExportContext(searchParams: URLSearchParams, permission: Permission) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const requestedCompanyId = searchParams.get("companyId")?.trim() || null
  const companyId = user.role === "superadmin" ? requestedCompanyId : user.churchId
  if (!companyId) {
    throw new Error("Igreja obrigatória")
  }

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
