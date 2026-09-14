import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("group and leader schemas validate and normalize meeting times correctly", () => {
  function validateAndNormalizeTime(value) {
    if (!value) return null
    const trimmed = String(value).trim()
    if (!trimmed) return null
    const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (!match) return { error: "Horário inválido" }
    const hours = parseInt(match[1], 10)
    const minutes = parseInt(match[2], 10)
    const seconds = match[3] !== undefined ? parseInt(match[3], 10) : 0
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      return { error: "Horário inválido" }
    }
    const h = match[1].padStart(2, "0")
    const m = match[2]
    return { value: `${h}:${m}` }
  }

  // Valid inputs with seconds (from DB time columns)
  assert.deepEqual(validateAndNormalizeTime("20:01:00"), { value: "20:01" })
  assert.deepEqual(validateAndNormalizeTime("20:00:00"), { value: "20:00" })
  assert.deepEqual(validateAndNormalizeTime("19:30:45"), { value: "19:30" })

  // Valid inputs without seconds (from input type="time")
  assert.deepEqual(validateAndNormalizeTime("20:01"), { value: "20:01" })
  assert.deepEqual(validateAndNormalizeTime("09:30"), { value: "09:30" })
  assert.deepEqual(validateAndNormalizeTime("9:30"), { value: "09:30" })

  // Empty / null
  assert.equal(validateAndNormalizeTime(""), null)
  assert.equal(validateAndNormalizeTime(null), null)
  assert.equal(validateAndNormalizeTime(undefined), null)
  assert.equal(validateAndNormalizeTime("   "), null)

  // Invalid times
  assert.deepEqual(validateAndNormalizeTime("24:00"), { error: "Horário inválido" })
  assert.deepEqual(validateAndNormalizeTime("20:60"), { error: "Horário inválido" })
  assert.deepEqual(validateAndNormalizeTime("20:00:60"), { error: "Horário inválido" })
  assert.deepEqual(validateAndNormalizeTime("abc"), { error: "Horário inválido" })
})

test("source files include meetingTime normalization and slices", () => {
  const groupsActions = read("src/lib/groups/actions.ts")
  const leaderActions = read("src/lib/cells/leader-actions.ts")
  const groupsData = read("src/lib/groups/data.ts")
  const cellsData = read("src/lib/cells/data.ts")
  const groupsClient = read("src/app/(dashboard)/gceus/groups-client.tsx")
  const cellFormFields = read("src/components/cells/cell-form-fields.tsx")

  // Checks that schemas accept optional seconds
  assert.match(groupsActions, /\(\?::\(\\d\{2\}\)\)\?\$\//)
  assert.match(leaderActions, /\(\?::\(\\d\{2\}\)\)\?\$\//)

  // Checks that data layers truncate meeting_time to HH:mm
  assert.match(groupsData, /row\.meeting_time \? row\.meeting_time\.slice\(0, 5\) : null/)
  assert.match(cellsData, /row\.meeting_time \? row\.meeting_time\.slice\(0, 5\) : null/)

  // Checks that form state and submission truncate to HH:mm
  assert.match(groupsClient, /group\.meetingTime \? group\.meetingTime\.slice\(0, 5\) : ""/)
  assert.match(groupsClient, /form\.meetingTime \? form\.meetingTime\.slice\(0, 5\) : null/)

  // Checks that time input uses 5 chars
  assert.match(cellFormFields, /form\.meetingTime \? form\.meetingTime\.slice\(0, 5\) : ""/)
})
