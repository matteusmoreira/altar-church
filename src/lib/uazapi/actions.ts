"use server"

import { revalidatePath } from "next/cache"
import type postgres from "postgres"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import type { UazapiActionResult, UazapiInstanceStatus } from "./types"

const nameSchema = z.string().trim().min(2).max(80)
const tokenSchema = z.string().trim().min(20).max(500)
const idSchema = z.string().uuid()

interface ProviderInstance {
  id: string
  name: string
  status: UazapiInstanceStatus
  profileName: string | null
  phone: string | null
  qrcode?: string
  paircode?: string
}

function providerConfig() {
  const baseUrl = (process.env.UAZAPI_BASE_URL ?? "").replace(/\/$/, "")
  if (!baseUrl) throw new Error("UAZAPI_BASE_URL não configurada")
  return { baseUrl, adminToken: process.env.UAZAPI_ADMIN_TOKEN ?? "" }
}

async function assertChurchAdmin() {
  const user = await getCurrentUser()
  if (!user || !["admin", "superadmin"].includes(user.role)) {
    throw new Error("Somente administradores da igreja podem gerenciar instâncias WhatsApp")
  }
  return { user, companyId: requireUserCompanyId(user) }
}

function normalizeProvider(payload: Record<string, unknown>): ProviderInstance {
  const raw = (payload.instance ?? payload) as Record<string, unknown>
  const statusValue = String(raw.status ?? "disconnected")
  const status: UazapiInstanceStatus = ["disconnected", "connecting", "connected"].includes(statusValue)
    ? (statusValue as UazapiInstanceStatus)
    : "error"
  const owner = String(raw.owner ?? "")
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? raw.profileName ?? "WhatsApp"),
    status,
    profileName: raw.profileName ? String(raw.profileName) : null,
    phone: owner || null,
    qrcode: raw.qrcode ? String(raw.qrcode) : undefined,
    paircode: raw.paircode ? String(raw.paircode) : undefined,
  }
}

async function providerRequest(
  path: string,
  options: { token?: string; admin?: boolean; method?: "GET" | "POST"; body?: unknown } = {},
) {
  const { baseUrl, adminToken } = providerConfig()
  if (options.admin && !adminToken) throw new Error("UAZAPI_ADMIN_TOKEN não configurado")
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.admin ? { admintoken: adminToken } : { token: options.token ?? "" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(String(payload.message ?? payload.error ?? `Uazapi recusou a operação (${response.status})`))
  }
  return payload
}

async function assertQuota(
  tx: postgres.TransactionSql,
  companyId: string,
) {
  await tx`select pg_advisory_xact_lock(hashtext(${companyId}))`
  const rows = await tx<{ used: number; limit: number; company_name: string }[]>`
    select
      count(instance.id)::int as used,
      coalesce(plan.uazapi_instance_limit, 0)::int as limit,
      company.name as company_name
    from public.companies company
    left join public.system_plans plan on plan.id = company.plan_id
    left join public.uazapi_instances instance
      on instance.company_id = company.id and instance.active = true
    where company.id = ${companyId}
    group by company.id, company.name, plan.uazapi_instance_limit
  `
  const quota = rows[0]
  if (!quota || quota.used >= quota.limit) {
    throw new Error(`Limite do plano atingido (${quota?.used ?? 0}/${quota?.limit ?? 0} instâncias)`)
  }
  return quota
}

async function assertQuotaAvailable(companyId: string) {
  const sql = getSql()
  const rows = await sql<{ used: number; limit: number }[]>`
    select
      count(instance.id)::int as used,
      coalesce(plan.uazapi_instance_limit, 0)::int as limit
    from public.companies company
    left join public.system_plans plan on plan.id = company.plan_id
    left join public.uazapi_instances instance
      on instance.company_id = company.id and instance.active = true
    where company.id = ${companyId}
    group by company.id, plan.uazapi_instance_limit
  `
  const quota = rows[0]
  if (!quota || quota.used >= quota.limit) {
    throw new Error(`Limite do plano atingido (${quota?.used ?? 0}/${quota?.limit ?? 0} instâncias)`)
  }
}

async function saveProviderInstance(input: {
  companyId: string
  profileId: string
  token: string
  provider: ProviderInstance
  preferredName?: string
}) {
  const sql = getSql()
  await sql.begin(async (tx) => {
    await assertQuota(tx, input.companyId)
    const current = await tx<{ total: number }[]>`
      select count(*)::int as total
      from public.uazapi_instances
      where company_id = ${input.companyId} and active = true
    `
    const secretName = `uazapi_${input.companyId}_${input.provider.id}`
    const secretRows = await tx<{ id: string }[]>`
      select vault.create_secret(
        ${input.token},
        ${secretName},
        ${`Uazapi instance ${input.provider.id} for company ${input.companyId}`}
      )::text as id
    `
    const secretId = secretRows[0]?.id
    if (!secretId) throw new Error("Não foi possível proteger o token no Vault")

    try {
      await tx`
        insert into public.uazapi_instances (
          company_id, provider_instance_id, name, status, profile_name, phone,
          vault_secret_id, is_default, created_by, updated_by, last_checked_at
        )
        values (
          ${input.companyId}, ${input.provider.id},
          ${input.preferredName || input.provider.name}, ${input.provider.status},
          ${input.provider.profileName}, ${input.provider.phone}, ${secretId}::uuid,
          ${(current[0]?.total ?? 0) === 0}, ${input.profileId}, ${input.profileId}, now()
        )
      `
    } catch (error) {
      await tx`delete from vault.secrets where id = ${secretId}::uuid`
      throw error
    }
  })
}

function resultError(error: unknown): UazapiActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

export async function createUazapiInstance(nameInput: string): Promise<UazapiActionResult> {
  try {
    const name = nameSchema.parse(nameInput)
    const { user, companyId } = await assertChurchAdmin()
    await assertQuotaAvailable(companyId)
    const sql = getSql()
    const company = await sql<{ name: string }[]>`
      select name from public.companies where id = ${companyId} limit 1
    `
    const payload = await providerRequest("/instance/create", {
      admin: true,
      method: "POST",
      body: { name, adminField01: companyId, adminField02: company[0]?.name ?? "" },
    })
    const provider = normalizeProvider(payload)
    const token = String(payload.token ?? (payload.instance as Record<string, unknown> | undefined)?.token ?? "")
    if (!provider.id || !token) throw new Error("Uazapi não retornou ID/token da nova instância")
    await saveProviderInstance({ companyId, profileId: user.id, token, provider, preferredName: name })
    await writeAuditLog({
      action: "uazapi.instance.create",
      entityTable: "uazapi_instances",
      companyId,
      metadata: { providerInstanceId: provider.id, name },
    })
    revalidatePath("/configuracoes")
    return { ok: true }
  } catch (error) {
    return resultError(error)
  }
}

export async function connectExistingUazapiInstance(
  tokenInput: string,
): Promise<UazapiActionResult> {
  try {
    const token = tokenSchema.parse(tokenInput)
    const { user, companyId } = await assertChurchAdmin()
    await assertQuotaAvailable(companyId)
    const provider = normalizeProvider(await providerRequest("/instance/status", { token }))
    if (!provider.id) throw new Error("Token não identificou uma instância Uazapi")
    await saveProviderInstance({ companyId, profileId: user.id, token, provider })
    await writeAuditLog({
      action: "uazapi.instance.connect_existing",
      entityTable: "uazapi_instances",
      companyId,
      metadata: { providerInstanceId: provider.id, status: provider.status },
    })
    revalidatePath("/configuracoes")
    return { ok: true }
  } catch (error) {
    return resultError(error)
  }
}

async function getStoredToken(companyId: string, instanceId: string) {
  const sql = getSql()
  const rows = await sql<{ token: string }[]>`
    select secret.decrypted_secret as token
    from public.uazapi_instances instance
    join vault.decrypted_secrets secret on secret.id = instance.vault_secret_id
    where instance.id = ${instanceId}
      and instance.company_id = ${companyId}
      and instance.active = true
    limit 1
  `
  if (!rows[0]?.token) throw new Error("Instância não encontrada")
  return rows[0].token
}

export async function requestUazapiQr(instanceIdInput: string): Promise<UazapiActionResult> {
  try {
    const instanceId = idSchema.parse(instanceIdInput)
    const { companyId } = await assertChurchAdmin()
    const token = await getStoredToken(companyId, instanceId)
    const connectProvider = normalizeProvider(
      await providerRequest("/instance/connect", { token, method: "POST", body: {} }),
    )
    const statusProvider = normalizeProvider(await providerRequest("/instance/status", { token }))
    const provider = {
      ...statusProvider,
      qrcode: statusProvider.qrcode ?? connectProvider.qrcode,
      paircode: statusProvider.paircode ?? connectProvider.paircode,
    }
    const sql = getSql()
    await sql`
      update public.uazapi_instances
      set status = ${provider.status}, profile_name = ${provider.profileName},
          phone = ${provider.phone}, last_checked_at = now()
      where id = ${instanceId} and company_id = ${companyId}
    `
    revalidatePath("/configuracoes")
    return {
      ok: true,
      data: { qrCode: provider.qrcode, pairCode: provider.paircode, status: provider.status },
    }
  } catch (error) {
    return resultError(error)
  }
}

export async function refreshUazapiInstance(instanceIdInput: string): Promise<UazapiActionResult> {
  try {
    const instanceId = idSchema.parse(instanceIdInput)
    const { companyId } = await assertChurchAdmin()
    const token = await getStoredToken(companyId, instanceId)
    const provider = normalizeProvider(await providerRequest("/instance/status", { token }))
    const sql = getSql()
    await sql`
      update public.uazapi_instances
      set status = ${provider.status}, name = ${provider.name},
          profile_name = ${provider.profileName}, phone = ${provider.phone},
          last_checked_at = now()
      where id = ${instanceId} and company_id = ${companyId}
    `
    revalidatePath("/configuracoes")
    return { ok: true, data: { status: provider.status, qrCode: provider.qrcode, pairCode: provider.paircode } }
  } catch (error) {
    return resultError(error)
  }
}

export async function setDefaultUazapiInstance(instanceIdInput: string): Promise<UazapiActionResult> {
  try {
    const instanceId = idSchema.parse(instanceIdInput)
    const { user, companyId } = await assertChurchAdmin()
    const sql = getSql()
    await sql.begin(async (tx) => {
      await tx`update public.uazapi_instances set is_default = false, updated_by = ${user.id} where company_id = ${companyId}`
      const rows = await tx<{ id: string }[]>`
        update public.uazapi_instances
        set is_default = true, updated_by = ${user.id}
        where id = ${instanceId} and company_id = ${companyId} and active = true
        returning id
      `
      if (!rows[0]) throw new Error("Instância não encontrada")
    })
    revalidatePath("/configuracoes")
    return { ok: true }
  } catch (error) {
    return resultError(error)
  }
}

export async function removeUazapiInstance(instanceIdInput: string): Promise<UazapiActionResult> {
  try {
    const instanceId = idSchema.parse(instanceIdInput)
    const { user, companyId } = await assertChurchAdmin()
    const sql = getSql()
    await sql.begin(async (tx) => {
      const rows = await tx<{ vault_secret_id: string; is_default: boolean }[]>`
        select vault_secret_id, is_default
        from public.uazapi_instances
        where id = ${instanceId} and company_id = ${companyId} and active = true
        for update
      `
      const removed = rows[0]
      if (!removed) throw new Error("Instância não encontrada")
      await tx`
        update public.uazapi_instances
        set active = false, is_default = false, updated_by = ${user.id}
        where id = ${instanceId} and company_id = ${companyId} and active = true
      `
      await tx`delete from vault.secrets where id = ${removed.vault_secret_id}::uuid`
      if (removed.is_default) {
        await tx`
          update public.uazapi_instances
          set is_default = true, updated_by = ${user.id}
          where id = (
            select id from public.uazapi_instances
            where company_id = ${companyId} and active = true
            order by created_at limit 1
          )
        `
      }
    })
    await writeAuditLog({
      action: "uazapi.instance.remove",
      entityTable: "uazapi_instances",
      entityId: instanceId,
      companyId,
    })
    revalidatePath("/configuracoes")
    return { ok: true }
  } catch (error) {
    return resultError(error)
  }
}
