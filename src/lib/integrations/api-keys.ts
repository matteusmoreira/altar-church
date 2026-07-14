import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { hashApiKey } from "./crypto"
import type { ApiKeyRow, ApiKeyScope } from "./types"

function toIso(value: Date | string | null | undefined) {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function mapKey(row: {
  id: string
  company_id: string
  name: string
  key_prefix: string
  scopes: string[]
  last_used_at: Date | string | null
  expires_at: Date | string | null
  revoked_at: Date | string | null
  created_at: Date | string
}): ApiKeyRow {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes as ApiKeyScope[],
    lastUsedAt: toIso(row.last_used_at),
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  }
}

export async function listApiKeys(companyIdInput?: string | null): Promise<ApiKeyRow[]> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  const companyId = requireUserCompanyId(user, companyIdInput)
  await requirePermission("settings.manage_settings", companyId)
  const sql = getSql()
  const rows = await sql<{
    id: string
    company_id: string
    name: string
    key_prefix: string
    scopes: string[]
    last_used_at: Date | string | null
    expires_at: Date | string | null
    revoked_at: Date | string | null
    created_at: Date | string
  }[]>`
    select id, company_id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at
    from public.api_keys
    where company_id = ${companyId}
    order by created_at desc
  `
  return rows.map(mapKey)
}

export async function findApiKeyBySecret(secret: string): Promise<{
  id: string
  companyId: string
  scopes: ApiKeyScope[]
} | null> {
  if (!secret.startsWith("ack_")) return null
  const keyHash = hashApiKey(secret)
  const sql = getSql()
  const rows = await sql<{
    id: string
    company_id: string
    scopes: string[]
  }[]>`
    select id, company_id, scopes
    from public.api_keys
    where key_hash = ${keyHash}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  `
  const row = rows[0]
  if (!row) return null

  void sql`
    update public.api_keys set last_used_at = now() where id = ${row.id}
  `.catch(() => undefined)

  return {
    id: row.id,
    companyId: row.company_id,
    scopes: row.scopes as ApiKeyScope[],
  }
}

export function apiKeyHasScope(scopes: ApiKeyScope[], required: ApiKeyScope | ApiKeyScope[]) {
  const needed = Array.isArray(required) ? required : [required]
  if (scopes.includes("*")) return true
  return needed.every((s) => scopes.includes(s))
}
