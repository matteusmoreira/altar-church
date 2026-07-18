import assert from "node:assert/strict"
import { test } from "node:test"

// Chave de teste (32 bytes hex) definida ANTES de importar o módulo.
process.env.KIDS_HEALTH_ENCRYPTION_KEY = "a".repeat(64)
process.env.KIDS_PIN_PEPPER = "pepper-separado-de-teste-com-entropia-suficiente"

const security = await import("../src/lib/kids/security.ts")

test("token de retirada: opaco, único e verificável somente por hash", () => {
  const tokenA = security.generatePickupToken()
  const tokenB = security.generatePickupToken()
  assert.match(tokenA, /^[A-Za-z0-9_-]{32}$/)
  assert.notEqual(tokenA, tokenB)

  const hash = security.hashPickupToken(tokenA)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.equal(security.verifyPickupToken(tokenA, hash), true)
  assert.equal(security.verifyPickupToken(tokenB, hash), false)
  assert.equal(security.verifyPickupToken(tokenA, "x".repeat(64)), false)
})

test("PIN: seis dígitos, hash com pepper e verificação por attendance", () => {
  for (let i = 0; i < 20; i += 1) {
    assert.match(security.generatePickupPin(), /^\d{6}$/)
  }

  const attendanceId = crypto.randomUUID()
  const pin = security.generatePickupPin()
  const hash = security.hashPickupPin(attendanceId, pin)
  assert.match(hash, /^[0-9a-f]{64}$/)

  assert.equal(security.verifyPickupPin(attendanceId, pin, hash), true)

  const wrongPin = pin === "000000" ? "000001" : "000000"
  assert.equal(security.verifyPickupPin(attendanceId, wrongPin, hash), false)

  // Mesmo PIN em outro atendimento não valida (sal por attendanceId).
  assert.equal(security.verifyPickupPin(crypto.randomUUID(), pin, hash), false)
})

test("PIN: sem chave configurada o hash falha de forma explícita", () => {
  const original = process.env.KIDS_PIN_PEPPER
  delete process.env.KIDS_PIN_PEPPER
  try {
    assert.throws(() => security.hashPickupPin(crypto.randomUUID(), "123456"), /Configure KIDS_PIN_PEPPER/)
  } finally {
    process.env.KIDS_PIN_PEPPER = original
  }
})

test("saúde: AES-256-GCM com roundtrip e detecção de adulteração", () => {
  const secret = JSON.stringify({ allergies: "amendoim", instructions: "usar epipen" })
  const encrypted = security.encryptHealthDetails(secret)
  assert.match(encrypted, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  assert.equal(encrypted.includes("amendoim"), false)

  assert.equal(security.decryptHealthDetails(encrypted), secret)
  assert.equal(security.decryptHealthDetails(""), "")
  assert.equal(security.decryptHealthDetails(null), "")

  const parts = encrypted.split(".")
  const tampered = [parts[0], parts[1], parts[2], parts[3].slice(0, -2) + "xx"].join(".")
  assert.throws(() => security.decryptHealthDetails(tampered))
  assert.throws(() => security.decryptHealthDetails("lixo"))
})

test("saúde: chave inválida (tamanho errado) gera erro claro", () => {
  const original = process.env.KIDS_HEALTH_ENCRYPTION_KEY
  process.env.KIDS_HEALTH_ENCRYPTION_KEY = "abcd"
  try {
    assert.throws(() => security.encryptHealthDetails("x"), /32 bytes/)
  } finally {
    process.env.KIDS_HEALTH_ENCRYPTION_KEY = original
  }
})

test("máscaras e etiqueta não expõem dados sensíveis", () => {
  assert.equal(security.maskPhone("(11) 98765-4321"), "(11) 9****-4321")
  assert.equal(security.maskPhone("1132654321"), "(11) ****-4321")
  assert.equal(security.maskPhone(""), "****")
  assert.equal(security.maskEmail("maria.silva@igreja.com"), "m***@igreja.com")
  assert.equal(security.maskEmail(""), "")

  assert.equal(security.formatChildLabelName("Maria Clara Souza"), "Maria S.")
  assert.equal(security.formatChildLabelName("João"), "João")
  assert.equal(security.formatChildLabelName("  "), "")

  assert.deepEqual(
    security.labelAlertFlags({ hasAllergy: true, hasDietaryRestriction: false, hasMedication: true, hasSpecialNeeds: false }),
    ["ALERGIA", "MEDICAÇÃO"],
  )
  assert.deepEqual(
    security.labelAlertFlags({ hasAllergy: false, hasDietaryRestriction: false, hasMedication: false, hasSpecialNeeds: true }),
    ["ATENÇÃO"],
  )
})
