import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { getSql } from "@/lib/db/client"
import { afterResponse } from "@/lib/performance/after-response"

type PublicRateLimitInput = {
  companyId: string
  scope: string
  resourceId: string
  limit: number
}

function normalizeAddress(value: string | null) {
  return value?.split(",")[0]?.trim().toLowerCase() || null
}

let lastPruneAt = 0

export async function getPublicRequestAddress(): Promise<string | null> {
  const headerStore = await headers()
  const provider = process.env.PUBLIC_RATE_LIMIT_TRUSTED_PROXY?.trim().toLowerCase()
  const address = provider === "vercel"
    ? headerStore.get("x-vercel-forwarded-for")
    : provider === "cloudflare"
      ? headerStore.get("cf-connecting-ip")
      : provider === "nginx"
        ? headerStore.get("x-real-ip")
        : (
            // Auto-detecção resiliente de headers padrão quando o provedor não estiver explicitamente configurado
            headerStore.get("x-vercel-forwarded-for") ||
            headerStore.get("cf-connecting-ip") ||
            headerStore.get("x-real-ip") ||
            headerStore.get("x-forwarded-for")
          )
  const normalized = normalizeAddress(address)
  if (normalized) return normalized
  // Sem endereco identificavel nao ha como limitar: falha fechado em producao.
  // Fora de producao, "unknown" agrupa tudo num unico balde (ainda limitado).
  if (!isProduction() || !provider) {
    return provider ? null : "unknown"
  }
  return null
}

export function hashPublicRateLimitKey(scope: string, resourceId: string, address: string) {
  return createHash("sha256")
    .update(`altar-public:${scope}:${resourceId}:${address}`, "utf8")
    .digest("hex")
}

function isProduction() {
  return process.env.NODE_ENV === "production"
}

export async function consumePublicRateLimit(input: PublicRateLimitInput) {
  // Fail-closed em producao: DISABLED e FAIL_OPEN sao saidas de emergencia local/dev.
  if (process.env.PUBLIC_RATE_LIMIT_DISABLED === "1" && !isProduction()) {
    return true
  }
  const limit = Math.max(1, Math.floor(input.limit))
  const address = await getPublicRequestAddress()
  if (!address) return false
  const ipHash = hashPublicRateLimitKey(input.scope, input.resourceId, address)
  try {
    const rows = await getSql()<
      { submission_count: number }[]
    >`
      insert into public.public_registration_rate_limits (
        company_id, ip_hash, window_start, submission_count
      )
      values (${input.companyId}, ${ipHash}, date_trunc('hour', now()), 1)
      on conflict (company_id, ip_hash, window_start)
      do update set submission_count = public.public_registration_rate_limits.submission_count + 1,
                    updated_at = now()
      returning submission_count
    `
    schedulePublicRateLimitPrune()
    return Number(rows[0]?.submission_count ?? 1) <= limit
  } catch (error) {
    console.error("[public-rate-limit] erro ao registrar rate limit", error)
    // Fail-closed em producao; fail-open fora dela para nao travar dev/E2E local.
    return !isProduction() || process.env.PUBLIC_RATE_LIMIT_FAIL_OPEN === "1"
  }
}

/**
 * Rate limit global para rotas utilitarias sem tenant (/api/geocode, /api/cep).
 * Usa public.global_rate_limits; mesmo fail-closed de producao do consumePublicRateLimit.
 */
export async function consumeGlobalRateLimit(scope: string, limit: number) {
  if (process.env.PUBLIC_RATE_LIMIT_DISABLED === "1" && !isProduction()) {
    return true
  }
  const safeLimit = Math.max(1, Math.floor(limit))
  const address = await getPublicRequestAddress()
  if (!address) return false
  const ipHash = hashPublicRateLimitKey(scope, "global", address)
  try {
    const rows = await getSql()<
      { submission_count: number }[]
    >`
      insert into public.global_rate_limits (ip_hash, scope, window_start, submission_count)
      values (${ipHash}, ${scope}, date_trunc('hour', now()), 1)
      on conflict (ip_hash, scope, window_start)
      do update set submission_count = public.global_rate_limits.submission_count + 1,
                    updated_at = now()
      returning submission_count
    `
    return Number(rows[0]?.submission_count ?? 1) <= safeLimit
  } catch (error) {
    console.error("[global-rate-limit] erro ao registrar rate limit", error)
    return !isProduction() || process.env.PUBLIC_RATE_LIMIT_FAIL_OPEN === "1"
  }
}

function schedulePublicRateLimitPrune() {
  const now = Date.now()
  if (now - lastPruneAt < 60 * 60 * 1000) return
  lastPruneAt = now
  afterResponse("public-rate-limit-prune", async () => {
    try {
      await getSql()`
        delete from public.public_registration_rate_limits
        where id in (
          select id
          from public.public_registration_rate_limits
          where window_start < date_trunc('hour', now()) - interval '24 hours'
          order by window_start asc
          limit 500
        )
      `
    } catch (error) {
      lastPruneAt = 0
      throw error
    }
  })
}
