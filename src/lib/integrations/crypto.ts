import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

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

function isPrivateIpv4(host: string) {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const parts = ipv4.slice(1).map(Number)
  if (parts.some((n) => n > 255)) return true
  const [a, b] = parts
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isPrivateIpv6(host: string) {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "")
  if (normalized === "::" || normalized === "::1") return true
  const mappedDotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mappedDotted?.[1]) return isPrivateIpv4(mappedDotted[1])

  const halves = normalized.split("::")
  if (halves.length > 2) return false
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return false
  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right].map((part) => Number.parseInt(part, 16))
  if (parts.length !== 8 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 0xffff)) return false
  if (parts.every((part) => part === 0) || (parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1)) return true
  if ((parts[0] & 0xfe00) === 0xfc00 || (parts[0] & 0xffc0) === 0xfe80) return true
  if (parts.slice(0, 5).every((part) => part === 0) && parts[5] === 0xffff) {
    const ipv4 = `${parts[6] >> 8}.${parts[6] & 255}.${parts[7] >> 8}.${parts[7] & 255}`
    return isPrivateIpv4(ipv4)
  }
  return false
}

export function isPrivateOrLocalHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (host === "localhost" || host === "0.0.0.0" || host === "metadata.google.internal" || host === "metadata.google") {
    return true
  }
  if (isPrivateIpv4(host)) return true
  return isIP(host) === 6 && isPrivateIpv6(host)
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
  if (url.username || url.password) {
    throw new Error("URL de webhook não pode conter credenciais")
  }
  if (isPrivateOrLocalHostname(url.hostname) && !isDev) {
    throw new Error("URL de webhook não pode apontar para rede privada")
  }
  return url
}

/**
 * Revalida o DNS no momento do envio. Isso bloqueia endpoints públicos que,
 * no momento da entrega, resolvem para loopback, RFC1918, link-local ou
 * metadata. O transporte ainda deve manter redirect: "error".
 */
export async function assertResolvableSafeWebhookUrl(urlString: string) {
  const url = assertSafeWebhookUrl(urlString)
  if (process.env.NODE_ENV !== "development" && isIP(url.hostname) === 0) {
    const records = await lookup(url.hostname, { all: true, verbatim: true })
    if (records.length === 0 || records.some((record) => isPrivateOrLocalHostname(record.address))) {
      throw new Error("URL de webhook resolve para rede privada")
    }
  }
  return url
}
