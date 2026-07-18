import assert from "node:assert/strict"
import { test } from "node:test"

process.env.KIDS_HEALTH_ENCRYPTION_KEY = "b".repeat(64)

const { ageMonthsAt, suggestClassroom, saoPauloParts } = await import("../src/lib/kids/suggest.ts")
const { buildKidLabelModel, buildQrPayload, parseQrPayload } = await import("../src/lib/kids/printing.ts")
const events = await import("../src/lib/kids/events.ts")

function candidate(overrides) {
  return {
    sessionClassroomId: overrides.sessionClassroomId ?? crypto.randomUUID(),
    classroomId: overrides.classroomId ?? crypto.randomUUID(),
    name: overrides.name ?? "Sala",
    congregationId: overrides.congregationId ?? null,
    minAgeMonths: overrides.minAgeMonths ?? 0,
    maxAgeMonths: overrides.maxAgeMonths ?? 216,
    capacity: overrides.capacity ?? 10,
    occupied: overrides.occupied ?? 0,
    isOpen: overrides.isOpen ?? true,
    rules: overrides.rules ?? [],
  }
}

function rule(overrides) {
  return {
    congregationId: null,
    weekday: null,
    startTime: null,
    endTime: null,
    minAgeMonths: 0,
    maxAgeMonths: 216,
    priority: 100,
    isActive: true,
    ...overrides,
  }
}

test("idade em meses considera dia do aniversário", () => {
  const at = new Date("2026-07-19T12:00:00Z")
  assert.equal(ageMonthsAt("2025-07-19", at), 12)
  assert.equal(ageMonthsAt("2025-07-20", at), 11)
  assert.equal(ageMonthsAt("2026-07-19", at), 0)
  assert.equal(ageMonthsAt(null, at), null)
  assert.equal(ageMonthsAt("data-invalida", at), null)
})

test("fuso de São Paulo para regras de dia/horário", () => {
  // 22:30 UTC de domingo = 19:30 de domingo em São Paulo
  const parts = saoPauloParts(new Date("2026-07-19T22:30:00Z"))
  assert.equal(parts.weekday, 0)
  assert.equal(parts.minutes, 19 * 60 + 30)
})

test("sugestão prioriza regra específica de congregação e menor prioridade", () => {
  const congregationId = crypto.randomUUID()
  const salaGeral = candidate({ name: "Geral", rules: [rule({ priority: 200 })] })
  const salaCongregacao = candidate({ name: "Cong", congregationId, rules: [rule({ congregationId, priority: 50 })] })
  const result = suggestClassroom({
    ageMonths: 36,
    congregationId,
    at: new Date("2026-07-19T22:30:00Z"),
    candidates: [salaGeral, salaCongregacao],
  })
  assert.equal(result.sessionClassroomId, salaCongregacao.sessionClassroomId)
  assert.equal(result.reason, "rule")
})

test("sugestão respeita dia da semana e horário da regra", () => {
  const matching = candidate({
    name: "Dom19",
    rules: [rule({ weekday: 0, startTime: "19:00", endTime: "21:00", priority: 10 })],
  })
  const wrongDay = candidate({
    name: "Sab",
    rules: [rule({ weekday: 6, priority: 1 })],
  })
  const result = suggestClassroom({
    ageMonths: 24,
    congregationId: null,
    at: new Date("2026-07-19T22:30:00Z"),
    candidates: [wrongDay, matching],
  })
  assert.equal(result.sessionClassroomId, matching.sessionClassroomId)
})

test("sugestão nunca retorna sala lotada ou fechada", () => {
  const full = candidate({ name: "Cheia", capacity: 5, occupied: 5 })
  const closed = candidate({ name: "Fechada", isOpen: false })
  assert.equal(suggestClassroom({ ageMonths: 36, congregationId: null, at: new Date(), candidates: [full, closed] }), null)

  const open = candidate({ name: "Aberta", capacity: 5, occupied: 4 })
  const result = suggestClassroom({ ageMonths: 36, congregationId: null, at: new Date(), candidates: [full, open] })
  assert.equal(result.sessionClassroomId, open.sessionClassroomId)
})

test("sugestão cai para faixa etária da sala quando não há regra", () => {
  const nursery = candidate({ name: "Berçário", minAgeMonths: 0, maxAgeMonths: 24 })
  const juniors = candidate({ name: "Juniores", minAgeMonths: 60, maxAgeMonths: 132 })
  // Idade fora de qualquer faixa: operador decide — sistema sugere a sala com mais folga.
  const fallback = suggestClassroom({
    ageMonths: 36,
    congregationId: null,
    at: new Date("2026-07-19T22:30:00Z"),
    candidates: [nursery, juniors],
  })
  assert.equal(fallback.reason, "capacity")

  const kids36 = candidate({ name: "Kids", minAgeMonths: 25, maxAgeMonths: 59 })
  const withFit = suggestClassroom({
    ageMonths: 36,
    congregationId: null,
    at: new Date("2026-07-19T22:30:00Z"),
    candidates: [nursery, juniors, kids36],
  })
  assert.equal(withFit.sessionClassroomId, kids36.sessionClassroomId)
  assert.equal(withFit.reason, "age_range")
})

test("etiqueta: nome reduzido, alertas genéricos e QR opaco", () => {
  const label = buildKidLabelModel({
    childFullName: "Maria Clara Souza",
    classroomName: "Kids 3-5",
    sessionTitle: "Culto 19h",
    pickupPin: "123456",
    pickupToken: "t".repeat(32),
    health: { hasAllergy: true, hasDietaryRestriction: false, hasMedication: true, hasSpecialNeeds: false },
    checkedInAt: "2026-07-19T22:35:00Z",
  })
  assert.equal(label.childName, "Maria S.")
  assert.equal(label.childName.includes("Clara"), false)
  assert.deepEqual(label.alertFlags, ["ALERGIA", "MEDICAÇÃO"])
  assert.equal(label.qrPayload, `ak1.${"t".repeat(32)}`)
  assert.equal(label.qrPayload.includes("Maria"), false)
  assert.equal(label.pickupCode, "123456")
})

test("QR payload: roundtrip e rejeição de lixo", () => {
  const token = "a".repeat(32)
  assert.equal(parseQrPayload(buildQrPayload(token)), token)
  assert.equal(parseQrPayload(token), token, "aceita token puro legado")
  assert.equal(parseQrPayload("https://evil.com/x"), null)
  assert.equal(parseQrPayload(""), null)
  assert.equal(parseQrPayload("ak1."), null)
})

test("contrato de webhooks: payloads sem saúde, PIN, token ou observações", () => {
  const forbidden = events.KIDS_FORBIDDEN_PAYLOAD_KEYS
  const sample = {
    kidId: crypto.randomUUID(),
    personId: crypto.randomUUID(),
    attendanceId: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    incidentId: crypto.randomUUID(),
    childFullName: "Maria Clara Souza",
    classroomName: "Kids 3-5",
    isVisitor: true,
    checkedInAt: "2026-07-19T22:35:00Z",
    checkedOutAt: "2026-07-19T23:50:00Z",
    requestedAt: "2026-07-19T23:40:00Z",
    calledAt: "2026-07-19T23:00:00Z",
    createdAt: "2026-07-19T23:05:00Z",
    requestedBy: "staff",
    override: false,
    reason: "choro",
    severity: "warning",
    title: "Criança passou mal",
  }
  const payloads = [
    events.buildChildRegisteredPayload(sample),
    events.buildCheckinCreatedPayload(sample),
    events.buildCheckoutRequestedPayload(sample),
    events.buildCheckoutCompletedPayload(sample),
    events.buildGuardianCalledPayload(sample),
    events.buildIncidentCreatedPayload(sample),
  ]
  for (const payload of payloads) {
    const serialized = JSON.stringify(payload)
    for (const key of forbidden) {
      assert.equal(serialized.includes(`"${key}"`), false, `payload não deve conter ${key}`)
    }
    assert.equal(serialized.includes("Clara Souza"), false, "payload usa nome reduzido")
  }
})
