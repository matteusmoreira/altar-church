/**
 * Helpers for jsonb with `postgres` (porsager).
 *
 * NÃO use `${JSON.stringify(obj)}::jsonb` — o driver serializa de novo e
 * grava um *jsonb string* (`"{\"a\":1}"`) em vez de objeto. Sintomas:
 * - UI mostra `{}` (typeof string)
 * - Webhook envia body JSON-stringificado duas vezes → destino não lê phone
 */

import type postgres from "postgres"

type Sql = ReturnType<typeof postgres>

/** Valor pronto para coluna jsonb (objeto/array real). */
export function jsonbParam(sql: Sql, value: unknown) {
  return sql.json(value as Parameters<Sql["json"]>[0])
}

/**
 * Normaliza payload lido do banco: se veio string JSON (legado double-encode),
 * faz parse até obter objeto.
 */
export function parseJsonbObject(value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value === "string") {
    try {
      let parsed: unknown = JSON.parse(value)
      // string dupla: "\"{...}\"" → parse → string → parse → object
      if (typeof parsed === "string") {
        try {
          parsed = JSON.parse(parsed)
        } catch {
          /* keep string */
        }
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

/** Body HTTP a partir de payload outbox (objeto ou string legada). */
export function jsonbPayloadToHttpBody(payload: unknown): string {
  if (typeof payload === "string") {
    const trimmed = payload.trim()
    if (!trimmed) return "{}"
    // já é JSON textual (objeto serializado) — envia como está
    try {
      const once = JSON.parse(trimmed)
      if (typeof once === "string") {
        // double-encoded string content
        JSON.parse(once) // validate
        return once
      }
      return trimmed
    } catch {
      return JSON.stringify({ raw: payload })
    }
  }
  return JSON.stringify(payload ?? {})
}
