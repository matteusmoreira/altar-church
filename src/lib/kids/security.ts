/**
 * Segurança do módulo Kids.
 *
 * - Credencial de retirada: token opaco (QR) e PIN de 6 dígitos, SEMPRE somente em hash.
 * - Detalhes de saúde: cifrados com AES-256-GCM na camada de aplicação; o banco guarda
 *   apenas `v1.<iv>.<tag>.<ciphertext>` (base64url). Indicadores booleanos ficam em claro.
 * - Este arquivo é propositalmente livre de dependências do projeto (apenas node:crypto)
 *   para poder ser testado de forma isolada com `node --test`.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

const HEALTH_KEY_ENV = "KIDS_HEALTH_ENCRYPTION_KEY"
const PIN_PEPPER_ENV = "KIDS_PIN_PEPPER"
const ENCRYPTED_PREFIX = "v1"

function readHealthKey(): Buffer | null {
  const raw = process.env[HEALTH_KEY_ENV]?.trim()
  if (!raw) return null
  let key: Buffer | null = null
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex")
  } else {
    try {
      key = Buffer.from(raw, "base64")
    } catch {
      key = null
    }
  }
  if (!key || key.length !== 32) {
    throw new Error(`${HEALTH_KEY_ENV} deve ter 32 bytes (64 hex ou base64)`)
  }
  return key
}

function readPinPepper(): Buffer {
  const raw = process.env[PIN_PEPPER_ENV]?.trim()
  if (raw) return createHash("sha256").update(raw, "utf8").digest()
  const healthKey = readHealthKey()
  if (healthKey) return healthKey
  throw new Error(`Configure ${PIN_PEPPER_ENV} ou ${HEALTH_KEY_ENV} para credenciais Kids`)
}

export function isKidsSecurityConfigured(): boolean {
  try {
    return readHealthKey() !== null
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Credencial de retirada (token opaco + PIN rotativo)
// ---------------------------------------------------------------------------

/** Token opaco do QR de retirada (192 bits de entropia, base64url, sem dados pessoais). */
export function generatePickupToken(): string {
  return randomBytes(24).toString("base64url")
}

/** Hash SHA-256 do token; é o único valor persistido. */
export function hashPickupToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function verifyPickupToken(token: string, expectedHash: string): boolean {
  return safeEqualHex(hashPickupToken(token), expectedHash)
}

/** PIN rotativo de seis dígitos. */
export function generatePickupPin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

/**
 * Hash do PIN com HMAC-SHA256 (pepper de servidor + attendanceId como sal).
 * PIN tem espaço pequeno (10^6): nunca armazene hash simples.
 */
export function hashPickupPin(attendanceId: string, pin: string): string {
  return createHmac("sha256", readPinPepper()).update(`${attendanceId}:${pin}`, "utf8").digest("hex")
}

export function verifyPickupPin(attendanceId: string, pin: string, expectedHash: string): boolean {
  return safeEqualHex(hashPickupPin(attendanceId, pin), expectedHash)
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

// ---------------------------------------------------------------------------
// Detalhes de saúde (AES-256-GCM)
// ---------------------------------------------------------------------------

export function encryptHealthDetails(plainText: string): string {
  if (!plainText) return ""
  const key = readHealthKey()
  if (!key) {
    throw new Error(`Configure ${HEALTH_KEY_ENV} para gravar detalhes de saúde`)
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [ENCRYPTED_PREFIX, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".")
}

export function decryptHealthDetails(payload: string | null | undefined): string {
  if (!payload) return ""
  const parts = payload.split(".")
  if (parts.length !== 4 || parts[0] !== ENCRYPTED_PREFIX) {
    throw new Error("Detalhes de saúde em formato inválido")
  }
  const key = readHealthKey()
  if (!key) {
    throw new Error(`Configure ${HEALTH_KEY_ENV} para ler detalhes de saúde`)
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"))
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8")
}

// ---------------------------------------------------------------------------
// Máscaras e etiqueta (nunca expõem dados sensíveis)
// ---------------------------------------------------------------------------

/** Telefone mascarado para listagens: (11) 9****-1234 */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 4) return "****"
  const last4 = digits.slice(-4)
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits[2] === "9" ? "9" : ""}****-${last4}`
  }
  return `****-${last4}`
}

/** E-mail mascarado: m***@dominio.com */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return ""
  const [local, domain] = email.split("@")
  return `${local.slice(0, 1)}***@${domain}`
}

/** Nome da etiqueta: primeiro nome + inicial do sobrenome ("Maria S."). */
export function formatChildLabelName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

/** Alertas visuais genéricos da etiqueta (detalhes só no painel autorizado). */
export function labelAlertFlags(indicators: {
  hasAllergy: boolean
  hasDietaryRestriction: boolean
  hasMedication: boolean
  hasSpecialNeeds: boolean
}): string[] {
  const flags: string[] = []
  if (indicators.hasAllergy) flags.push("ALERGIA")
  if (indicators.hasDietaryRestriction) flags.push("RESTRIÇÃO")
  if (indicators.hasMedication) flags.push("MEDICAÇÃO")
  if (indicators.hasSpecialNeeds) flags.push("ATENÇÃO")
  return flags
}
