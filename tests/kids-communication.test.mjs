import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const actions = await readFile(new URL("../src/lib/kids/actions.ts", import.meta.url), "utf8")
const communicationTab = await readFile(new URL("../src/app/(dashboard)/kids/kids-communication-tab.tsx", import.meta.url), "utf8")

test("Kids communication: deleteKidMessage action validates permission, soft-deletes and cancels outbox", () => {
  // Action exists and is exported
  assert.match(actions, /export async function deleteKidMessage/)
  // Enforces permission
  assert.match(actions, /await context\("kids\.communicate"\)/)
  // Soft deletes from kid_messages
  assert.match(actions, /update public\.kid_messages[\s\S]*set deleted_at = now\(\)/)
  // Cancels pending or queued outbox deliveries
  assert.match(actions, /delete from public\.kid_delivery_outbox[\s\S]*status in \('pending', 'queued'\)/)
  // Audits action
  assert.match(actions, /audit\("kids\.message\.delete", "kid_messages"/)
})

test("Kids communication: deleteKidConversation action validates permission, soft-deletes and audits", () => {
  // Action exists and is exported
  assert.match(actions, /export async function deleteKidConversation/)
  // Soft deletes from kid_conversations
  assert.match(actions, /update public\.kid_conversations[\s\S]*set deleted_at = now\(\)/)
  // Audits action
  assert.match(actions, /audit\("kids\.conversation\.delete", "kid_conversations"/)
})

test("Kids communication tab: implements 1-column layout with list and grid modes", () => {
  // 1-column root flow instead of 50/50 split
  assert.match(communicationTab, /className="space-y-6"/)
  // List and Grid icons imported and used
  assert.match(communicationTab, /List/)
  assert.match(communicationTab, /Grid2X2/)
  assert.match(communicationTab, /viewMode === "list"/)
  assert.match(communicationTab, /viewMode === "grid"/)
  // Modo Lista uses 1-column space-y-3
  assert.match(communicationTab, /viewMode === "list" && totalFilteredCount > 0[\s\S]*className="space-y-3"/)
  // Modo Grade uses responsive grid
  assert.match(communicationTab, /viewMode === "grid" && totalFilteredCount > 0[\s\S]*className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"/)
})

test("Kids communication tab: supports deleting cards with confirmation dialog", () => {
  // Delete action calls
  assert.match(communicationTab, /deleteKidMessage/)
  assert.match(communicationTab, /deleteKidConversation/)
  // Trash icon used on cards
  assert.match(communicationTab, /Trash2/)
  // Confirmation dialog
  assert.match(communicationTab, /AlertDialog/)
  assert.match(communicationTab, /Excluir card de comunicação\?/)
  assert.match(communicationTab, /Excluir comunicação/)
})

test("Kids communication tab: includes search, channel filter and translated status badges", () => {
  // Search and channel filter
  assert.match(communicationTab, /searchQuery/)
  assert.match(communicationTab, /channelFilter/)
  // Portuguese status badges
  assert.match(communicationTab, /Na fila/)
  assert.match(communicationTab, /Enviada/)
  assert.match(communicationTab, /Entregue/)
  assert.match(communicationTab, /Falha/)
  assert.match(communicationTab, /Cancelada/)
})

test("Kids communication tab: syncs active classrooms, displays formatted age and supports manual reload", async () => {
  // Syncs initialData
  assert.match(communicationTab, /setData\(initialData\)/)
  // Uses activeClassrooms from dashboard/props with fallback
  assert.match(communicationTab, /availableClassrooms =/)
  // Formats classroom age
  assert.match(communicationTab, /formatClassroomAge/)
  // Displays empty state if no rooms exist
  assert.match(communicationTab, /Nenhuma sala ativa encontrada/)
  // Manual refresh button
  assert.match(communicationTab, /handleRefresh/)
  assert.match(communicationTab, /Atualizar/)

  const kidsClient = await readFile(new URL("../src/app/(dashboard)/kids/kids-client.tsx", import.meta.url), "utf8")
  // kids-client passes active classrooms to KidsCommunicationTab
  assert.match(kidsClient, /activeClassrooms=\{data\.classrooms\.filter\(\(c\) => c\.isActive\)\}/)
  // kids-client invalidates communicationData on mutations
  assert.match(kidsClient, /setCommunicationData\(null\)/)

  const delivery = await readFile(new URL("../src/lib/kids/delivery.ts", import.meta.url), "utf8")
  // Delivery matches by classroom age range OR attendance in last 90 days
  assert.match(delivery, /from public\.kid_classrooms room/)
  assert.match(delivery, /room\.min_age_months/)
  assert.match(delivery, /room\.max_age_months/)
})
