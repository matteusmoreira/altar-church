"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { apiKeyPrefix, generateApiKeySecret, hashApiKey } from "./crypto"
import { API_KEY_SCOPES, type ApiKeyScope, type IntegrationsActionResult } from "./types"

const createSchema = z.object({
  companyId: z.union([z.string().uuid(), z.literal(""), z.null(), z.undefined()]).transform((v) => v || null),
  name: z.string().trim().min(1, "Nome obrigatório").max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES as unknown as [ApiKeyScope, ...ApiKeyScope[]])).min(1),
  expiresAt: z
    .union([z.string(), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v && String(v).trim() ? String(v) : null)),
})

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
