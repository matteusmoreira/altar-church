import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const migration = readFileSync("supabase/migrations/20260605120000_p4_operational_modules.sql", "utf8")

const requiredTables = [
  "events",
  "attendance_records",
  "crm_cards",
  "prayer_requests",
  "reading_plans",
  "announcements",
  "notification_groups",
  "notifications",
  "revenues",
  "expenses",
  "donations",
  "donation_recurrences",
  "subscription_plans",
  "subscriptions",
  "subscription_contents",
  "subscription_collections",
]

test("p4 operational modules define real persisted tables", () => {
  for (const table of requiredTables) {
    assert(
      migration.includes(`create table if not exists public.${table}`),
      `missing persisted table ${table}`,
    )
  }
})

test("p4 operational modules enable tenant RLS and company policies", () => {
  assert(migration.includes("alter table public.%I enable row level security"))
  assert(migration.includes("public.is_company_member(company_id)"))
  assert(migration.includes("grant select, insert, update, delete"))
})
