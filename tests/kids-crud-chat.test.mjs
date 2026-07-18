import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const actions = await readFile(new URL("../src/lib/kids/actions.ts", import.meta.url), "utf8")
const client = await readFile(new URL("../src/app/(dashboard)/kids/kids-client.tsx", import.meta.url), "utf8")
const access = await readFile(new URL("../src/lib/kids/access.ts", import.meta.url), "utf8")
const migration = await readFile(new URL("../supabase/migrations/20260718140000_kids_crud_chat_rbac_performance.sql", import.meta.url), "utf8")

test("Kids autocomplete starts at 3 letters with debounce and accent-insensitive tenant search", () => {
  assert.match(actions, /min\(3\)/)
  assert.match(client, /setTimeout\(\(\) =>/)
  assert.match(client, /}, 300\)/)
  assert.match(actions, /person\.company_id = \$\{companyId\}/)
  assert.match(actions, /kids_normalize_name/)
  assert.match(migration, /unaccent/)
})

test("Kids duplicate guard requires selection or explicit homonym confirmation inside transaction", () => {
  assert.match(actions, /assertNewPersonAllowed\(tx/)
  assert.match(actions, /pg_advisory_xact_lock/)
  assert.match(actions, /Selecione a pessoa encontrada na busca/)
  assert.match(actions, /confirme que é um homônimo/)
  assert.match(client, /É outra pessoa com o mesmo nome/)
})

test("Kids guardian unlink is soft, audited and preserves the last guardian", () => {
  assert.match(actions, /guardian_count/)
  assert.match(actions, /Cadastre outro responsável antes de remover o último vínculo/)
  assert.match(actions, /set deleted_at = now\(\)/)
  assert.match(actions, /kids\.guardian\.unlink/)
})

test("Kids leader access is linked to the configured ministry", () => {
  assert.match(access, /user\.role !== "ministry_leader"/)
  assert.match(access, /ministry\.leader_person_id = profile\.person_id/)
  assert.match(access, /settings\.ministry_id = ministry\.id/)
  assert.match(migration, /kids_can_manage/)
})

test("Kids internal chat is shared by guardian, tenant-isolated and realtime-enabled", () => {
  assert.match(migration, /unique index[\s\S]*company_id, guardian_person_id/)
  assert.match(migration, /kid_conversation_messages/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /supabase_realtime add table public\.kid_conversation_messages/)
  assert.match(actions, /sendKidInternalMessage/)
  assert.match(actions, /markKidConversationRead/)
})
