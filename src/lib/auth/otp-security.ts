import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

function pepper() {
  const value = process.env.AUTH_PASSWORD_RESET_PEPPER?.trim()
  if (!value || value.length < 32) {
    throw new Error("AUTH_PASSWORD_RESET_PEPPER deve ter pelo menos 32 caracteres")
  }
  return value
}

export function generatePasswordResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0")
}

export function hashPasswordResetValue(scope: string, value: string) {
  return createHmac("sha256", pepper()).update(`${scope}:${value}`, "utf8").digest("hex")
}

export function verifyPasswordResetHash(scope: string, value: string, expected: string) {
  const actual = Buffer.from(hashPasswordResetValue(scope, value), "hex")
  const target = Buffer.from(expected, "hex")
  return actual.length === target.length && timingSafeEqual(actual, target)
}
