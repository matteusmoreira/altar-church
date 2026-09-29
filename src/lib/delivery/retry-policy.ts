/**
 * Política de retry compartilhada pelos workers de entrega.
 * Erros 401/403 do provedor (token revogado, chave inválida, instância
 * desconectada) jamais se resolvem com retry — vão direto para `dead`,
 * onde o alerta de dead-letter avisa a operação em ~15min em vez de
 * queimar 8 tentativas ao longo de 24h.
 */
const PERMANENT_STATUS_PATTERN = /\b40[13]\b|unauthorized|forbidden/i

export function isPermanentProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const record = error as Record<string, unknown>
  const statusCode = record.statusCode ?? record.responseStatus
  if (typeof statusCode === "number" && (statusCode === 401 || statusCode === 403)) return true
  const response = record.response
  if (response && typeof response === "object") {
    const status = (response as Record<string, unknown>).status
    if (status === 401 || status === 403) return true
  }
  return error instanceof Error && PERMANENT_STATUS_PATTERN.test(error.message)
}
