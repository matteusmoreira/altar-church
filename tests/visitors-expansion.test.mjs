import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("Visitors module expansion: types, backend and actions", () => {
  const types = read("src/lib/people/types.ts")
  const data = read("src/lib/people/data.ts")
  const actions = read("src/lib/people/actions.ts")

  // Types
  assert.match(types, /export interface VisitorMetrics/)
  assert.match(types, /journeyStatus\?: string \| "all"/)
  assert.match(types, /accessProfile\?: string \| "all"/)
  assert.match(types, /cellId\?: string \| "all" \| "none"/)

  // Data
  assert.match(data, /export async function getVisitorMetrics/)
  assert.match(data, /journeyStatus = filters\.journeyStatus/)
  assert.match(data, /accessProfile = filters\.accessProfile/)
  assert.match(data, /cellId = filters\.cellId/)
  assert.match(data, /count\(\*\) filter \(where person_type = 'visitor'\)/)

  // Actions
  assert.match(actions, /export async function convertVisitorToMember/)
  assert.match(actions, /export async function assignVisitorToCell/)
  assert.match(actions, /action: "person\.convert_to_member"/)
  assert.match(actions, /action: "person\.assign_cell"/)
})

test("Visitors client interface: view modes, WhatsApp templates and modals", () => {
  const client = read("src/app/(dashboard)/visitantes/visitors-client.tsx")
  const page = read("src/app/(dashboard)/visitantes/page.tsx")

  // Page
  assert.match(page, /getVisitorMetrics\(\)/)
  assert.match(page, /getPersonFormOptions\(\)/)
  assert.match(page, /listPeople\(filters\)/)

  // Client View Modes
  assert.match(client, /altar_visitors_view_mode/)
  assert.match(client, /viewMode === "grid"/)
  assert.match(client, /viewMode === "list"/)
  assert.match(client, /LayoutGrid/)
  assert.match(client, /List/)

  // WhatsApp Templates
  assert.match(client, /whatsappTemplates/)
  assert.match(client, /Boas-vindas ao Culto/)
  assert.match(client, /Convite para Célula/)
  assert.match(client, /Acompanhamento & Oração/)
  assert.match(client, /https:\/\/wa\.me\//)

  // Modals & Actions
  assert.match(client, /openWhatsAppDialog/)
  assert.match(client, /openCellDialog/)
  assert.match(client, /openConvertDialog/)
  assert.match(client, /handleExportCsv/)
})
