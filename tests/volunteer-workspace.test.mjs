import assert from "node:assert/strict"
import test from "node:test"
import { buildWorkspaceEvents, summarizeShifts, workspaceMonth } from "../src/lib/volunteers/workspace.ts"
import { volunteerPreviewData } from "../src/lib/volunteers/preview-data.ts"

test("a função cheia não mascara vagas em outra função", () => {
  const { manager } = volunteerPreviewData()
  const shift = manager.schedules[0].shifts[0]
  const summary = summarizeShifts([
    { ...shift, requiredVolunteers: 1, assignments: [...shift.assignments, { ...shift.assignments[0], id: "extra" }] },
    { ...shift, id: "empty", requiredVolunteers: 1, assignments: [] },
  ])
  assert.equal(summary.required, 2)
  assert.equal(summary.assigned, 2)
  assert.equal(summary.missing, 1)
})

test("publicação, confirmação, recusa e vagas são estados independentes", () => {
  const { manager } = volunteerPreviewData()
  const published = buildWorkspaceEvents(manager).find((item) => item.id === "event-2")
  assert.equal(published.published, true)
  assert.equal(published.assigned, 2)
  assert.equal(published.confirmed, 1)
  assert.equal(published.awaiting, 1)
  assert.equal(published.declined, 1)
  assert.equal(published.missing, 1)
  assert.equal(published.swaps, 1)
})

test("programações e escalas antigas aparecem uma vez, em ordem", () => {
  const { manager } = volunteerPreviewData()
  const events = buildWorkspaceEvents(manager)
  assert.deepEqual(events.map((item) => item.id), ["event-1", "event-2", "event-existing"])
  assert.equal(events[0].shifts.length, 1)
  assert.equal(events[1].shifts.length, 2)
  assert.equal(events[2].required, 0)
})

test("escala avulsa sem evento permanece acessível", () => {
  const { manager } = volunteerPreviewData()
  manager.schedules[0].shifts.push({ ...manager.schedules[0].shifts[0], id: "standalone", eventId: null })
  assert.equal(buildWorkspaceEvents(manager).find((item) => item.id === "shift:standalone").shifts.length, 1)
})

test("parâmetro de mês inválido usa um período válido", () => {
  const fallback = new Date(2026, 8, 15)
  assert.equal(workspaceMonth("2026-13", fallback), "2026-09")
  assert.equal(workspaceMonth("invalid", fallback), "2026-09")
  assert.equal(workspaceMonth("2025-02", fallback), "2025-02")
})
