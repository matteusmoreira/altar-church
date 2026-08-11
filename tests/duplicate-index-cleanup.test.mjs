import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

test("migration removes only the redundant volunteer event-position index", () => {
  const sql = readFileSync(
    "supabase/migrations/20260811130000_remove_duplicate_volunteer_event_positions_idx.sql",
    "utf8",
  )
  assert.match(sql, /drop index if exists public\.volunteer_event_positions_company_event_idx/i)
  assert.doesNotMatch(sql, /drop index if exists public\.volunteer_event_positions_event_idx/i)
})
