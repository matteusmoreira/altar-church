import type { NextRequest } from "next/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { forbidden, unauthorized } from "@/lib/api/errors"
import { apiKeyHasScope, findApiKeyBySecret } from "@/lib/integrations/api-keys"
import type { ApiKeyScope } from "@/lib/integrations/types"
import type { Permission, User } from "@/lib/types"

export type ApiAuthContext = {
  user: User | null
  companyId: string
  authType: "session" | "api_key"
  apiKeyId?: string
  scopes?: ApiKeyScope[]
}

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

function extractBearerToken(request: Request | NextRequest) {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization")
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/**
 * Dual auth: API key (Bearer ack_…) or Supabase session cookie.
 * When scopes are provided, API keys must include them (or *).
 * Session users still use requirePermission when permission is passed via requireApiAuthPermission.
 */
export async function requireApiAuth(
  request: Request | NextRequest,
  options?: {
    requestedCompanyId?: string | null
    scopes?: ApiKeyScope | ApiKeyScope[]
    /** When using session, require this permission. Ignored for API keys (scopes used instead). */
    permission?: Permission
    /** API keys cannot call this endpoint (e.g. create/revoke keys). */
    sessionOnly?: boolean
  },
): Promise<ApiAuthContext> {
  const token = extractBearerToken(request)

  if (token?.startsWith("ack_")) {
    if (options?.sessionOnly) {
      throw forbidden("Esta operação exige login na interface")
    }
    const key = await findApiKeyBySecret(token)
    if (!key) throw unauthorized("API key inválida ou revogada")

    if (options?.scopes) {
      const ok = apiKeyHasScope(key.scopes, options.scopes)
      if (!ok) throw forbidden("API key sem escopo suficiente")
    }

    const requested = options?.requestedCompanyId?.trim() || null
    if (requested && requested !== key.companyId) {
      throw forbidden("API key não tem acesso a esta igreja")
    }

    return {
      user: null,
      companyId: key.companyId,
      authType: "api_key",
      apiKeyId: key.id,
      scopes: key.scopes,
    }
  }

  const user = await getCurrentUser()
  if (!user) throw unauthorized()

  const companyId = requireUserCompanyId(user, options?.requestedCompanyId)
  if (options?.permission) {
    try {
      await requirePermission(options.permission, companyId)
    } catch {
      throw forbidden()
    }
  }

  return {
    user,
    companyId,
    authType: "session",
  }
}

/** Resolve companyId from query/body and optional permission gate (session or API key). */
export async function requireApiListContext(
  request: NextRequest,
  permission?: Permission,
  scopes?: ApiKeyScope | ApiKeyScope[],
) {
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
  const bearer = extractBearerToken(request)
  const isApiKey = Boolean(bearer?.startsWith("ack_"))
  const scopeFromPermission = scopes ?? permissionToScopes(permission)

  // API keys only allowed when we have an explicit scope mapping for this route
  if (isApiKey) {
    if (!scopeFromPermission) {
      throw forbidden("API key não autorizada neste endpoint")
    }
    return requireApiAuth(request, {
      requestedCompanyId,
      scopes: scopeFromPermission,
      permission,
    })
  }

  if (permission) {
    const { user, companyId } = await requireApiPermission(permission, requestedCompanyId)
    return { user, companyId, authType: "session" as const }
  }
  const { user, companyId } = await requireApiCompany(requestedCompanyId)
  return { user, companyId, authType: "session" as const }
}

function permissionToScopes(permission?: Permission): ApiKeyScope[] | undefined {
  if (!permission) return undefined
  if (permission.startsWith("forms.")) {
    return permission.includes("view") ? ["forms:read"] : ["forms:write"]
  }
  if (permission.startsWith("crm.")) {
    return permission.includes("view") ? ["crm:read"] : ["crm:write"]
  }
  if (permission.startsWith("members.") || permission.startsWith("visitors.")) {
    return permission.includes("view") ? ["people:read"] : ["people:write"]
  }
  if (permission === "settings.manage_settings" || permission === "settings.edit") {
    return ["webhooks:manage"]
  }
  return undefined
}
