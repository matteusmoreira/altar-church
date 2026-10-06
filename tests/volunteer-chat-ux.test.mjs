import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8").replace(/\s+/g, " ")

test("avisos de escala ficam no painel do membro e preferências de notificação foram aposentadas", () => {
  const route = read("src/app/api/v1/volunteers/notification-preferences/route.ts")
  assert.match(route, /requireApiUser/)
  assert.match(route, /status: 410/)
  assert.match(route, /Os avisos de escala são exibidos no painel do membro e não exigem configuração\./)
  const member = read("src/components/member/member-dashboard.tsx")
  assert.match(member, /Avisos de escala/)
  assert.match(member, /Você foi escalado/)
  const ui = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")
  assert.doesNotMatch(ui, /Preferências de notificação/)
})

test("manual selector exposes profile photo, responsive dialog, pending state and fallback", () => {
  const ui = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")
  const actions = read("src/lib/volunteers/v2-actions.ts")
  const types = read("src/lib/volunteers/types.ts")
  assert.match(ui, /<Dialog open=\{open\}/)
  assert.match(ui, /<AvatarImage src=\{candidate\.photoUrl\}/)
  assert.match(ui, /<AvatarFallback>/)
  assert.match(ui, /Escolhendo\.\.\./)
  assert.match(actions, /person\.photo_file_id/)
  assert.match(actions, /createSignedUrlsByStoragePath/)
  assert.match(types, /photoUrl: string \| null/)
})

test("chat persists reads, shows unread badges and targets push by profile", () => {
  const migration = read("supabase/migrations/20260721170000_volunteer_chat_unread_profile_push.sql")
  const data = read("src/lib/volunteers/data.ts")
  const actions = read("src/lib/volunteers/v2-actions.ts")
  const worker = read("supabase/functions/volunteer-delivery-worker/index.ts")
  const ui = read("src/app/(dashboard)/voluntariado/volunteer-v2-workspace.tsx")
  assert.match(migration, /volunteer_shift_conversation_reads/)
  assert.match(migration, /target_profile_id/)
  assert.match(data, /unread_chat_count/)
  assert.match(actions, /markVolunteerShiftConversationRead/)
  assert.match(actions, /chat_message_id, target_profile_id/)
  assert.match(actions, /target\.role in \('superadmin', 'admin', 'pastor'\)/)
  assert.match(worker, /delivery\.target_profile_id/)
  assert.match(ui, /mensagens não lidas/)
  assert.match(ui, /useVolunteerChatRealtime/)
})

test("admin can permanently delete one event schedule while preserving event", () => {
  const actions = read("src/lib/volunteers/v2-actions.ts")
  const ui = read("src/app/(dashboard)/voluntariado/components/escala-culto-drawer.tsx")
  assert.match(actions, /deleteVolunteerEventSchedule/)
  assert.match(actions, /\["superadmin", "admin"\]\.includes\(user\.role\)/)
  assert.match(actions, /delete from public\.volunteer_shifts/)
  assert.match(actions, /update public\.events set volunteer_schedule_published_at = null/)
  assert.doesNotMatch(actions, /delete from public\.events/)
  assert.match(actions, /volunteer_schedule\.delete/)
  assert.match(ui, /Avisos já entregues não podem ser desfeitos/)
  assert.match(ui, /Excluir permanentemente/)
})
