import assert from "node:assert/strict"
import test from "node:test"
import {
  formatBrazilianWhatsapp,
  maskBrazilianWhatsapp,
  normalizeBrazilianWhatsapp,
  toUazapiNumber,
} from "../src/lib/auth/phone.ts"

process.env.AUTH_PASSWORD_RESET_PEPPER = "a".repeat(64)

test("normaliza e mascara somente WhatsApp móvel brasileiro", () => {
  assert.equal(normalizeBrazilianWhatsapp("(11) 98765-4321"), "11987654321")
  assert.equal(normalizeBrazilianWhatsapp("+55 11 98765-4321"), "11987654321")
  assert.equal(normalizeBrazilianWhatsapp("(11) 3876-4321"), null)
  assert.equal(normalizeBrazilianWhatsapp("(00) 98765-4321"), null)
  assert.equal(normalizeBrazilianWhatsapp("(20) 98765-4321"), null)
  assert.equal(formatBrazilianWhatsapp("11987654321"), "(11) 98765-4321")
  assert.equal(maskBrazilianWhatsapp("11987654321"), "(11) 9****-4321")
  assert.equal(toUazapiNumber("11987654321"), "5511987654321")
})

test("HMAC do OTP é escopado por solicitação e comparado com segurança", async () => {
  const security = await import("../src/lib/auth/otp-security.ts")
  const first = security.hashPasswordResetValue("request-a", "123456")
  const second = security.hashPasswordResetValue("request-b", "123456")
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, second)
  assert.equal(security.verifyPasswordResetHash("request-a", "123456", first), true)
  assert.equal(security.verifyPasswordResetHash("request-a", "654321", first), false)
  assert.match(security.generatePasswordResetCode(), /^\d{6}$/)
})
