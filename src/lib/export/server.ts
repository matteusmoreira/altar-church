import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import type { Permission } from "@/lib/types"

export class ExportHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = "ExportHttpError"
  }
}

export function toExportErrorResponse(error: unknown) {
  if (error instanceof ExportHttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }

  if (error instanceof Error && error.message === "Igreja obrigatória") {
    return Response.json({ error: error.message }, { status: 400 })
  }

  const message =
    process.env.NODE_ENV === "production"
      ? "Erro inesperado"
      : error instanceof Error
        ? error.message
        : "Erro inesperado"

  return Response.json({ error: message }, { status: 500 })
}

export async function requireExportContext(searchParams: URLSearchParams, permission: Permission) {
  const user = await getCurrentUser()
  if (!user) {
    throw new ExportHttpError("Não autenticado", 401)
  }

  const requestedCompanyId = searchParams.get("companyId")?.trim() || null
  const companyId = requireUserCompanyId(user, requestedCompanyId)

  try {
    await requirePermission(permission, companyId)
  } catch {
    throw new ExportHttpError("Acesso negado", 403)
  }

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
