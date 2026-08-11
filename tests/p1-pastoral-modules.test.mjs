import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P1 pastoral modules expose real server data and audited mutations", () => {
  const data = read("src/lib/pastoral/data.ts")
  const actions = read("src/lib/pastoral/actions.ts")
  const types = read("src/lib/pastoral/types.ts")

  for (const expected of [
    /export interface MinistryListItem/,
    /export interface ProgrammingListItem/,
    /export interface SongListItem/,
  ]) {
    assert.match(types, expected)
  }

  for (const expected of [
    /export async function listMinistries/,
    /export async function listProgrammings/,
    /export async function listSongs/,
    /from public\.ministries/i,
    /from public\.programmings/i,
    /from public\.songs/i,
    /deleted_at is null/i,
    /requirePermission\("ministries\.view"/,
    /requireCompanyAccess/,
  ]) {
    assert.match(data, expected)
  }

  for (const expected of [
    /"use server"/,
    /export async function saveMinistry/,
    /leaderPersonId[\s\S]*company_id = \$\{companyId\}[\s\S]*Lider nao encontrado nesta igreja/,
    /export async function deleteMinistry/,
    /export async function saveProgramming/,
    /export async function deleteProgramming/,
    /export async function saveSong/,
    /export async function deleteSong/,
    /z\.object/,
    /writeAuditLog/,
    /action: "ministry\.save"/,
    /action: "programming\.save"/,
    /action: "song\.save"/,
    /revalidatePath\("\/ministerios"\)/,
    /revalidatePath\("\/programacao"\)/,
    /revalidatePath\("\/informacoes"\)/,
  ]) {
    assert.match(actions, expected)
  }
})

test("P1 pastoral module pages do not import mock data", () => {
  const routes = [
    { slug: "ministerios", client: "ministries" },
    { slug: "programacao", client: "programming" },
  ]

  for (const route of routes) {
    const page = read(`src/app/(dashboard)/${route.slug}/page.tsx`)
    const client = read(`src/app/(dashboard)/${route.slug}/${route.client}-client.tsx`)

    assert.doesNotMatch(page, /"use client"/)
    assert.doesNotMatch(page, /@\/lib\/mock\/data/)
    assert.doesNotMatch(client, /@\/lib\/mock\/data/)
    assert.doesNotMatch(client, /router\.refresh\(\)/)
  }

  assert.match(read("src/app/(dashboard)/ministerios/page.tsx"), /listMinistries/)
  assert.match(read("src/app/(dashboard)/programacao/page.tsx"), /redirect\("\/voluntariado"\)/)
  assert.match(read("src/app/(dashboard)/ministerios/ministries-client.tsx"), /saveMinistry/)
  assert.match(read("src/app/(dashboard)/programacao/programming-client.tsx"), /saveProgramming/)
})
