import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("P2 migration creates content and banner schema with RLS", () => {
  const sql = read("supabase/migrations/20260602140000_p2_content_public_schema.sql")

  for (const table of ["content_categories", "content_posts", "banners"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"))
    assert.match(sql, new RegExp(`grant .* on public\\.${table}`, "i"))
  }

  assert.match(sql, /company_id uuid not null references public\.companies\(id\)/i)
  assert.match(sql, /content_posts_company_type_status_idx/i)
  assert.match(sql, /banners_company_active_sort_idx/i)
  assert.match(sql, /Published content readable publicly/i)
  assert.match(sql, /Active banners readable publicly/i)
  assert.match(sql, /public\.is_company_member\(company_id\)/i)
  assert.match(sql, /insert into public\.content_categories/i)
  assert.match(sql, /insert into public\.content_posts/i)
})

test("content dashboard uses server data and audited server actions", () => {
  const page = read("src/app/(dashboard)/conteudo/page.tsx")
  const client = read("src/app/(dashboard)/conteudo/content-client.tsx")
  const routeActions = read("src/app/(dashboard)/conteudo/actions.ts")
  const data = read("src/lib/content/data.ts")
  const actions = read("src/lib/content/actions.ts")
  const types = read("src/lib/content/types.ts")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /getContentDashboardData/)
  assert.match(page, /ContentClient/)
  assert.doesNotMatch(page, /mockNews|mockDevotionals|mockEBDs|mockPublications|mockBanners/)

  assert.match(client, /^"use client"/)
  assert.match(client, /saveContentPost/)
  assert.match(client, /saveContentBanner/)
  assert.match(client, /deleteContentPost/)
  assert.doesNotMatch(client, /router\.refresh\(\)/)
  assert.doesNotMatch(client, /@\/lib\/mock\/data/)

  assert.match(routeActions, /saveContentPost/)
  assert.match(types, /export interface ContentDashboardData/)
  assert.match(types, /export interface PublicChurchData/)

  assert.match(data, /export async function getContentDashboardData/)
  assert.match(data, /export async function getPublicChurchData/)
  assert.match(data, /requirePermission\("content\.view"/)
  assert.match(data, /from public\.content_posts/i)
  assert.match(data, /from public\.content_categories/i)
  assert.match(data, /from public\.banners/i)

  assert.match(actions, /"use server"/)
  assert.match(actions, /z\.object/)
  assert.match(actions, /export async function saveContentPost/)
  assert.match(actions, /export async function deleteContentPost/)
  assert.match(actions, /export async function saveContentBanner/)
  assert.match(actions, /export async function deleteContentBanner/)
  assert.match(actions, /requirePermission\("content\.create"/)
  assert.match(actions, /requirePermission\("content\.edit"/)
  assert.match(actions, /requirePermission\("content\.delete"/)
  assert.match(actions, /requirePermission\("content\.publish"/)
  assert.match(actions, /writeAuditLog/)
  assert.match(actions, /action: "content_post\.save"/)
  assert.match(actions, /action: "banner\.save"/)
  assert.match(actions, /revalidatePath\("\/conteudo"\)/)
})

test("public church page reads published real data without client mock", () => {
  const page = read("src/app/(public)/church/[slug]/page.tsx")

  assert.doesNotMatch(page, /^"use client"/)
  assert.match(page, /getPublicChurchData/)
  assert.match(page, /notFound\(\)/)
  assert.match(page, /Conteúdos recentes/)
  assert.match(page, /Programação/)
  assert.match(page, /Ministérios/)
  assert.match(page, /Congregações/)
  assert.doesNotMatch(page, /useParams/)
  assert.doesNotMatch(page, /mockChurches|mockEvents|mockMinistries|mockCells/)
})
