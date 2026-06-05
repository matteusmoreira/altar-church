import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("members page loads real P1 people data on the server", () => {
  const page = read("src/app/(dashboard)/members/page.tsx")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /listPeople/)
  assert.match(page, /getPeopleDashboardData/)
  assert.match(page, /getPersonFormOptions/)
  assert.match(page, /MembersClient/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
})

test("members client uses server actions for create, edit and delete", () => {
  const client = read("src/app/(dashboard)/members/members-client.tsx")

  assert.match(client, /^"use client"/)
  assert.match(client, /savePerson/)
  assert.match(client, /deletePerson/)
  assert.match(client, /router\.refresh\(\)/)
  assert.match(client, /peopleResult\.people/)
  assert.doesNotMatch(client, /mockMembers/)
  assert.doesNotMatch(client, /setMembers/)
})

test("member detail page shows real profile history and journey data", () => {
  const page = read("src/app/(dashboard)/members/[id]/page.tsx")
  const client = read("src/app/(dashboard)/members/[id]/member-detail-client.tsx")
  const data = read("src/lib/people/data.ts")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /params:\s*Promise/)
  assert.match(page, /getPersonDetail/)
  assert.match(page, /MemberDetailClient/)
  assert.match(client, /^"use client"/)
  assert.match(client, /person\.customFields/)
  assert.match(client, /person\.activities/)
  assert.match(client, /person\.journeySteps/)
  assert.match(client, /Hist[oó]rico pastoral/)
  assert.match(data, /export async function getPersonDetail/)
  assert.match(data, /person_custom_field_values/)
  assert.match(data, /person_activity_assignments/)
  assert.match(data, /person_journey_progress/)
  assert.doesNotMatch(page, /@\/lib\/mock\/data/)
  assert.doesNotMatch(client, /@\/lib\/mock\/data/)
})

test("members duplicates flow lists candidates and resolves with audited server action", () => {
  const page = read("src/app/(dashboard)/members/page.tsx")
  const client = read("src/app/(dashboard)/members/members-client.tsx")
  const actions = read("src/lib/people/actions.ts")
  const routeActions = read("src/app/(dashboard)/members/actions.ts")
  const data = read("src/lib/people/data.ts")
  const types = read("src/lib/people/types.ts")

  assert.match(page, /listDuplicateCandidates/)
  assert.match(page, /duplicateCandidates=/)
  assert.match(client, /duplicateCandidates/)
  assert.match(client, /Resolver duplicidade/)
  assert.match(client, /Ignorar suspeita/)
  assert.match(client, /resolveDuplicateCandidate/)
  assert.match(actions, /export async function resolveDuplicateCandidate/)
  assert.match(actions, /duplicate_candidates/)
  assert.match(actions, /action: "person_duplicate\.resolve"/)
  assert.match(actions, /revalidatePath\("\/members"\)/)
  assert.match(routeActions, /resolveDuplicateCandidate/)
  assert.match(data, /export async function listDuplicateCandidates/)
  assert.match(data, /primary_person/)
  assert.match(data, /duplicate_person/)
  assert.match(types, /DuplicateCandidateItem/)
})

test("P1 seed migration creates real people, congregations and person metadata", () => {
  const sql = read("supabase/migrations/20260602133000_p1_seed_people_church_data.sql")

  assert.match(sql, /insert into public\.congregations/i)
  assert.match(sql, /insert into public\.people/i)
  assert.match(sql, /insert into public\.person_custom_fields/i)
  assert.match(sql, /insert into public\.person_activities/i)
  assert.match(sql, /insert into public\.member_journeys/i)
  assert.match(sql, /insert into public\.member_journey_steps/i)
  assert.match(sql, /insert into public\.duplicate_candidates/i)
  assert.match(sql, /on conflict/i)
  assert.doesNotMatch(sql, /\bchurch_id\b/i)
})
