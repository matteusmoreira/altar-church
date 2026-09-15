import assert from "node:assert/strict"
import { test } from "node:test"
import { kidClassroomSchema, kidClassroomRuleSchema } from "../src/lib/kids/schemas.ts"
import { suggestClassroom } from "../src/lib/kids/suggest.ts"

function formatClassroomAge(minAgeMonths, maxAgeMonths) {
  function ageLabel(ageMonths) {
    if (ageMonths == null) return "—"
    const years = Math.floor(ageMonths / 12)
    const months = ageMonths % 12
    if (years === 0) return `${months}m`
    if (months === 0) return `${years}a`
    return `${years}a ${months}m`
  }

  const minYears = Math.floor(minAgeMonths / 12)
  const maxYears = Math.floor(maxAgeMonths / 12)
  if (minAgeMonths % 12 === 0 && maxAgeMonths % 12 === 0) {
    if (minYears === maxYears) return `${minYears} ${minYears === 1 ? "ano" : "anos"}`
    return `${minYears} a ${maxYears} anos`
  }
  return `${ageLabel(minAgeMonths)}–${ageLabel(maxAgeMonths)}`
}

test("kidClassroomSchema: aceita minAgeYears e maxAgeYears e converte para meses", () => {
  const result = kidClassroomSchema.parse({
    name: "Maternal",
    minAgeYears: 2,
    maxAgeYears: 5,
    capacity: 15,
  })
  assert.equal(result.name, "Maternal")
  assert.equal(result.minAgeMonths, 24)
  assert.equal(result.maxAgeMonths, 60)
  assert.equal(result.capacity, 15)
})

test("kidClassroomSchema: valores default quando idades em anos não são especificadas", () => {
  const result = kidClassroomSchema.parse({
    name: "Geral",
    capacity: 20,
  })
  assert.equal(result.minAgeMonths, 0)
  assert.equal(result.maxAgeMonths, 216)
})

test("kidClassroomSchema: aceita minAgeMonths e maxAgeMonths para retrocompatibilidade", () => {
  const result = kidClassroomSchema.parse({
    name: "Berçário",
    minAgeMonths: 0,
    maxAgeMonths: 24,
    capacity: 10,
  })
  assert.equal(result.minAgeMonths, 0)
  assert.equal(result.maxAgeMonths, 24)
})

test("kidClassroomSchema: rejeita idade máxima menor que mínima em anos", () => {
  assert.throws(
    () =>
      kidClassroomSchema.parse({
        name: "Inválida",
        minAgeYears: 5,
        maxAgeYears: 2,
        capacity: 10,
      }),
    (err) => {
      assert.ok(err.issues.some((i) => i.message.includes("Faixa etária inválida")))
      return true
    },
  )
})

test("kidClassroomRuleSchema: aceita minAgeYears e maxAgeYears e converte para meses", () => {
  const rule = kidClassroomRuleSchema.parse({
    classroomId: "11111111-1111-4111-8111-111111111111",
    minAgeYears: 3,
    maxAgeYears: 6,
    priority: 50,
  })
  assert.equal(rule.minAgeMonths, 36)
  assert.equal(rule.maxAgeMonths, 72)
  assert.equal(rule.priority, 50)
})

test("formatClassroomAge: formata corretamente faixas de idade em anos", () => {
  assert.equal(formatClassroomAge(0, 216), "0 a 18 anos")
  assert.equal(formatClassroomAge(24, 60), "2 a 5 anos")
  assert.equal(formatClassroomAge(36, 36), "3 anos")
  assert.equal(formatClassroomAge(12, 12), "1 ano")
  assert.equal(formatClassroomAge(6, 24), "6m–2a")
})

test("sugestão de salas criadas em anos opera perfeitamente com faixas calculadas", () => {
  const bercario = {
    sessionClassroomId: "sc-bercario",
    classroomId: "c-bercario",
    name: "Berçário (0 a 2 anos)",
    congregationId: null,
    minAgeMonths: 0 * 12, // 0
    maxAgeMonths: 2 * 12, // 24
    capacity: 10,
    occupied: 0,
    isOpen: true,
    rules: [],
  }

  const maternal = {
    sessionClassroomId: "sc-maternal",
    classroomId: "c-maternal",
    name: "Maternal (2 a 4 anos)",
    congregationId: null,
    minAgeMonths: 2 * 12, // 24
    maxAgeMonths: 4 * 12, // 48
    capacity: 15,
    occupied: 0,
    isOpen: true,
    rules: [],
  }

  const juniores = {
    sessionClassroomId: "sc-juniores",
    classroomId: "c-juniores",
    name: "Juniores (5 a 10 anos)",
    congregationId: null,
    minAgeMonths: 5 * 12, // 60
    maxAgeMonths: 10 * 12, // 120
    capacity: 20,
    occupied: 0,
    isOpen: true,
    rules: [],
  }

  const candidates = [bercario, maternal, juniores]

  // Criança de 1 ano (12 meses) deve cair no berçário
  const res1 = suggestClassroom({ ageMonths: 12, congregationId: null, at: new Date(), candidates })
  assert.equal(res1?.sessionClassroomId, "sc-bercario")

  // Criança de 3 anos (36 meses) deve cair no maternal
  const res2 = suggestClassroom({ ageMonths: 36, congregationId: null, at: new Date(), candidates })
  assert.equal(res2?.sessionClassroomId, "sc-maternal")

  // Criança de 7 anos (84 meses) deve cair nos juniores
  const res3 = suggestClassroom({ ageMonths: 84, congregationId: null, at: new Date(), candidates })
  assert.equal(res3?.sessionClassroomId, "sc-juniores")
})
