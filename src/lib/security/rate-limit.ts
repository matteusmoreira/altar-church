import { createHash } from "node:crypto"
import { headers } from "next/headers"
import { getSql } from "@/lib/db/client"

export interface RateLimitRule {
  /** Identifica a regra. Ex.: "auth.login.ip". */
  bucket: string
  /** Quem está sendo limitado (IP, telefone, e-mail). Nunca é persistido em claro. */
  identifier: string
  /** Máximo de requisições dentro da janela. */
  max: number
  /** Tamanho da janela em segundos. */
  windowSeconds: number
}

export interface RateLimitVerdict {
  allowed: boolean
  retryAfterSeconds: number
}

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0 }

/**
 * Hash estável para não guardar IP/telefone em texto puro na tabela de limite.
 * O objetivo é contar ocorrências, não identificar pessoas.
 */
export function hashRateLimitIdentifier(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32)
}

export async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitVerdict> {
  const key = `${rule.bucket}:${hashRateLimitIdentifier(rule.identifier)}`

  try {
    const rows = await getSql()<{ allowed: boolean }[]>`
      select public.consume_rate_limit(${key}, ${rule.max}, ${rule.windowSeconds}) as allowed
    `
    const allowed = rows[0]?.allowed ?? true
    return allowed ? ALLOWED : { allowed: false, retryAfterSeconds: rule.windowSeconds }
  } catch {
    // Rate limit é mitigação, não o controle primário de acesso. Se a checagem
    // falhar (ex.: migration ainda não aplicada), não derrubamos o login.
    return ALLOWED
  }
}

/** Verifica as regras em ordem e devolve a primeira que negar. */
export async function enforceRateLimits(rules: RateLimitRule[]): Promise<RateLimitVerdict> {
  for (const rule of rules) {
    const verdict = await consumeRateLimit(rule)
    if (!verdict.allowed) return verdict
  }
  return ALLOWED
}

/** IP do cliente atrás do proxy da Vercel. */
export async function requestClientIp() {
  const headerStore = await headers()
  const forwarded = headerStore.get("x-forwarded-for") ?? ""
  return forwarded.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown"
}

/** Mensagem padrão para o usuário quando o limite é atingido. */
export function rateLimitMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
  return `Muitas tentativas. Tente novamente em ${minutes} minuto${minutes > 1 ? "s" : ""}.`
}
