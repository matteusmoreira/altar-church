import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P3 migration creates group schema with tenant RLS", () => {
  const sql = read("supabase/migrations/20260602150000_p3_groups_schema.sql")
  const requiredTables = [
    "group_categories",
    "groups",
    "group_members",
    "group_meetings",
    "group_studies",
    "group_hierarchy_levels",
    "group_coordinators",
    "group_email_templates",
    "group_multiplications",
  ]

  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
    assert.match(sql, new RegExp(`grant .* on public\\.${table}`, "i"))
  }

  assert.match(sql, /company_id uuid not null references public\.companies\(id\)/i)
  assert.match(sql, /groups_company_active_idx/i)
  assert.match(sql, /group_members_group_status_idx/i)
  assert.match(sql, /group_meetings_group_starts_idx/i)
  assert.match(sql, /public\.is_company_member\(company_id\)/i)
  assert.match(sql, /insert into public\.group_categories/i)
  assert.match(sql, /insert into public\.groups/i)
  assert.match(sql, /insert into public\.group_members/i)
})

test("groups route uses server data and audited server actions", () => {
  const page = read("src/app/(dashboard)/gceus/page.tsx")
  const client = read("src/app/(dashboard)/gceus/groups-client.tsx")
  const operationsPanel = read("src/app/(dashboard)/gceus/group-operations-panel.tsx")
  const routeActions = read("src/app/(dashboard)/gceus/actions.ts")
  const data = read("src/lib/groups/data.ts")
  const actions = read("src/lib/groups/actions.ts")
  const types = read("src/lib/groups/types.ts")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /listGroups/)
  assert.match(page, /getGroupsDashboardData/)
  assert.match(page, /listGroupMembers/)
  assert.match(page, /listGroupMeetingReports/)
  assert.match(page, /GroupsClient/)
  assert.doesNotMatch(page, /mockGroups|mockGroupMeetings|mockGroupStudies|mockMembers/)

  assert.match(client, /^"use client"/)
  assert.match(client, /saveGroup/)
  assert.match(client, /deleteGroup/)
  assert.match(client, /GroupOperationsPanel/)
  assert.match(client, /router\.refresh\(\)/)
  assert.doesNotMatch(client, /@\/lib\/mock\/data/)

  assert.match(operationsPanel, /^"use client"/)
  assert.match(operationsPanel, /saveGroupMember/)
  assert.match(operationsPanel, /removeGroupMember/)
  assert.match(operationsPanel, /saveGroupMeeting/)
  assert.match(operationsPanel, /group-member-person-select/)
  assert.match(operationsPanel, /group-meeting-save-button/)

  assert.match(routeActions, /export async function saveGroup/)
  assert.match(routeActions, /export async function deleteGroup/)
  assert.match(routeActions, /export async function saveGroupMember/)
  assert.match(routeActions, /export async function removeGroupMember/)
  assert.match(routeActions, /export async function saveGroupMeeting/)

  assert.match(types, /export interface GroupListItem/)
  assert.match(types, /export interface SaveGroupInput/)
  assert.match(types, /export interface GroupMember/)
  assert.match(types, /export interface SaveGroupMemberInput/)
  assert.match(types, /export interface SaveGroupMeetingInput/)

  assert.match(data, /export async function listGroups/)
  assert.match(data, /export async function getGroupsDashboardData/)
  assert.match(data, /export async function getGroupFormOptions/)
  assert.match(data, /export async function listGroupMembers/)
  assert.match(data, /export async function listGroupMeetingReports/)
  assert.match(data, /requirePermission\("groups\.view"/)
  assert.match(data, /from public\.groups/i)
  assert.match(data, /join public\.group_members/i)
  assert.match(data, /from public\.group_studies/i)

  assert.match(actions, /"use server"/)
  assert.match(actions, /z\.object/)
  assert.match(actions, /export async function saveGroup/)
  assert.match(actions, /export async function deleteGroup/)
  assert.match(actions, /export async function saveGroupMember/)
  assert.match(actions, /export async function removeGroupMember/)
  assert.match(actions, /export async function saveGroupMeeting/)
  assert.match(actions, /requirePermission\("groups\.create"/)
  assert.match(actions, /requirePermission\("groups\.edit"/)
  assert.match(actions, /requirePermission\("groups\.delete"/)
  assert.match(actions, /writeAuditLog/)
  assert.match(actions, /action: "group\.save"/)
  assert.match(actions, /action: "group\.delete"/)
  assert.match(actions, /action: "group\.member\.save"/)
  assert.match(actions, /action: "group\.meeting\.save"/)
  assert.match(actions, /revalidatePath\("\/gceus"\)/)
})
