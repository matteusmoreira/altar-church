"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { apiKeyPrefix, generateApiKeySecret, hashApiKey } from "./crypto"
import { API_KEY_SCOPES, type ApiKeyRow, type ApiKeyScope, type IntegrationsActionResult } from "./types"

const createSchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal(""), z.null(), z.undefined()]).transform((v) => v || null),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES as unknown as [ApiKeyScope, ...ApiKeyScope[]])).min(1),
  expiresAt: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && String(v).trim() ? String(v) : null)),
})

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

export async function createApiKey(input: {
  companyId?: string | null
  name: string
  scopes: ApiKeyScope[]
  expiresAt?: string | null
}): Promise<IntegrationsActionResult> {
  try {
    const parsed = createSchema.parse(input)
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, parsed.companyId)
    await requirePermission("settings.manage_settings", companyId)

    const secret = generateApiKeySecret()
    const keyHash = hashApiKey(secret)
    const prefix = apiKeyPrefix(secret)
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.api_keys (
        company_id, name, key_prefix, key_hash, scopes, expires_at, created_by
      )
      values (
        ${companyId},
        ${parsed.name},
        ${prefix},
        ${keyHash},
        ${parsed.scopes},
        ${parsed.expiresAt},
        ${user.id}
      )
      returning id
    `
    const id = rows[0]?.id
    if (!id) throw new Error("Não foi possível criar a chave")

    await writeAuditLog({
      action: "api_key.create",
      entityTable: "api_keys",
      entityId: id,
      companyId,
      metadata: { name: parsed.name, scopes: parsed.scopes, keyPrefix: prefix },
    })
    revalidatePath("/configuracoes")

    return { ok: true, id, secret }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao criar chave",
    }
  }
}

export async function revokeApiKey(input: {
  id: string
  companyId?: string | null
}): Promise<IntegrationsActionResult> {
  try {
    const id = z.string().uuid().parse(input.id)
    const user = await getCurrentUser()
    if (!user) throw new Error("Acesso negado")
    const companyId = requireUserCompanyId(user, input.companyId)
    await requirePermission("settings.manage_settings", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.api_keys
      set revoked_at = now()
      where id = ${id}
        and company_id = ${companyId}
        and revoked_at is null
      returning id
    `
    if (!rows[0]?.id) throw new Error("Chave não encontrada")

    await writeAuditLog({
      action: "api_key.revoke",
      entityTable: "api_keys",
      entityId: id,
      companyId,
    })
    revalidatePath("/configuracoes")
    return { ok: true, id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro ao revogar chave",
    }
  }
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

  // Best-effort last_used update
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
