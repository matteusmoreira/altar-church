import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("church info page reads profile from server and saves social links with audit", () => {
  const page = read("src/app/(dashboard)/informacoes/page.tsx")
  const client = read("src/app/(dashboard)/informacoes/church-info-client.tsx")
  const routeActions = read("src/app/(dashboard)/informacoes/actions.ts")
  const data = read("src/lib/church-info/data.ts")
  const actions = read("src/lib/church-info/actions.ts")
  const types = read("src/lib/church-info/types.ts")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /getChurchInfoData/)
  assert.match(page, /ChurchInfoClient/)
  assert.doesNotMatch(page, /mockChurches/)
  assert.doesNotMatch(page, /mockMinistries/)
  assert.doesNotMatch(page, /mockProgrammings/)
  assert.doesNotMatch(page, /mockSongs/)
  assert.doesNotMatch(page, /mockCongregations/)

  assert.match(client, /^"use client"/)
  assert.match(client, /saveChurchInfo/)
  assert.match(client, /socialLinks/)
  assert.doesNotMatch(client, /router\.refresh\(\)/)
  assert.match(client, /Salvar alterações/)
  assert.doesNotMatch(client, /Upload de logo em desenvolvimento/)
  assert.doesNotMatch(client, /mockChurches/)

  assert.match(routeActions, /saveChurchInfo/)
  assert.match(types, /ChurchInfoData/)
  assert.match(types, /SaveChurchInfoInput/)
  assert.match(types, /SocialLinkItem/)

  assert.match(data, /export async function getChurchInfoData/)
  assert.match(data, /requirePermission\("settings\.edit"/)
  assert.match(data, /from public\.church_profiles/i)
  assert.match(data, /from public\.social_links/i)
  assert.match(data, /from public\.congregations/i)
  assert.match(data, /from public\.ministries/i)
  assert.match(data, /from public\.programmings/i)
  assert.match(data, /from public\.songs/i)

  assert.match(actions, /export async function saveChurchInfo/)
  assert.match(actions, /z\.object/)
  assert.match(actions, /requirePermission\("settings\.edit"/)
  assert.match(actions, /insert into public\.church_profiles/i)
  assert.match(actions, /insert into public\.social_links/i)
  assert.match(actions, /writeAuditLog/)
  assert.match(actions, /action: "church_profile\.save"/)
  assert.match(actions, /revalidatePath\("\/informacoes"\)/)
})
