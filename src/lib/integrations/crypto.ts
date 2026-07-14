import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export function generateWebhookSecret() {
  return randomBytes(32).toString("hex")
}

export function generateApiKeySecret() {
  const raw = randomBytes(32).toString("base64url")
  return `ack_live_${raw}`
}

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}

export function apiKeyPrefix(secret: string) {
  return secret.slice(0, 16)
}

export function signWebhookBody(secret: string, timestamp: string, rawBody: string) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  return `sha256=${digest}`
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string,
) {
  const expected = signWebhookBody(secret, timestamp, rawBody)
  const a = Buffer.from(expected)
  const b = Buffer.from(signatureHeader)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host === "metadata.google.internal") {
    return true
  }
  // IPv4
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    if (parts.some((n) => n > 255)) return true
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  // Simple IPv6 local/unique-local
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true
  return false
}

export function assertSafeWebhookUrl(urlString: string) {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error("URL de webhook inválida")
  }

  const httpsOnly = process.env.INTEGRATION_WEBHOOK_HTTPS_ONLY !== "0"
  const isDev = process.env.NODE_ENV === "development"
  if (httpsOnly && !isDev && url.protocol !== "https:") {
    throw new Error("Webhook deve usar HTTPS")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Protocolo de webhook não suportado")
  }
  if (isPrivateOrLocalHostname(url.hostname) && !isDev) {
    throw new Error("URL de webhook não pode apontar para rede privada")
  }
  return url
}
