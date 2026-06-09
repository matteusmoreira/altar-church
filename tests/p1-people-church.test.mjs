import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P1 migration creates people and church operational schema with company tenant", () => {
  const sql = read("supabase/migrations/20260602130000_p1_people_church_schema.sql")

  const requiredTables = [
    "people",
    "person_custom_fields",
    "person_custom_field_values",
    "person_activities",
    "person_activity_assignments",
    "member_journeys",
    "member_journey_steps",
    "person_journey_progress",
    "duplicate_candidates",
    "church_profiles",
    "ministries",
    "programmings",
    "songs",
    "congregations",
    "social_links",
    "people_import_exports",
    "public_registration_rate_limits",
  ]

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
  }

  assert.match(sql, /company_id uuid not null references public\.companies\(id\)/i)
  assert.doesNotMatch(sql, /\bchurch_id\b/i)
  assert.match(sql, /people_company_id_search_idx/i)
  assert.match(sql, /people_company_id_email_idx/i)
  assert.match(sql, /duplicate_candidates_company_id_status_idx/i)
  assert.match(sql, /public\.is_company_member\(company_id\)/i)
  assert.match(sql, /insert into public\.church_profiles/i)
})

test("P1 people service exposes server-side listing, dashboard and audited mutations", () => {
  const data = read("src/lib/people/data.ts")
  const actions = read("src/lib/people/actions.ts")
  const types = read("src/lib/people/types.ts")

  assert.match(types, /export interface PeopleListFilters/)
  assert.match(types, /export interface PersonListItem/)

  assert.match(data, /export async function listPeople/)
  assert.match(data, /export async function getPeopleDashboardData/)
  assert.match(data, /requirePermission\("members\.view"/)
  assert.match(data, /from public\.people/i)
  assert.match(data, /deleted_at is null/i)

  assert.match(actions, /"use server"/)
  assert.match(actions, /export async function savePerson/)
  assert.match(actions, /export async function deletePerson/)
  assert.match(actions, /z\.object/)
  assert.match(actions, /requirePermission\("members\.create"/)
  assert.match(actions, /requirePermission\("members\.edit"/)
  assert.match(actions, /requirePermission\("members\.delete"/)
  assert.match(actions, /writeAuditLog/)
  assert.match(actions, /action: "person\.save"/)
  assert.match(actions, /action: "person\.delete"/)
  assert.match(actions, /revalidatePath\("\/pessoas"\)/)
})
