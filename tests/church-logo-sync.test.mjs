import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

test("dashboard layout fetches and renders church logo in sidebar", () => {
  const layout = read("src/app/(dashboard)/layout.tsx")
  const client = read("src/components/layout/dashboard-layout.tsx")
  const logoComponent = read("src/components/layout/church-logo.tsx")

  assert.match(layout, /createSignedUrlsByStoragePath/)
  assert.match(layout, /left join public\.church_profiles cp/i)
  assert.match(layout, /left join public\.app_files logo/i)
  assert.match(layout, /churchLogoUrl=\{churchMeta\.logoUrl\}/)

  assert.match(client, /import \{ ChurchLogo \} from "@\/components\/layout\/church-logo"/)
  assert.match(client, /churchLogoUrl\?: string \| null/)
  assert.match(client, /<ChurchLogo[\s\S]*?logoUrl=\{churchLogoUrl\}[\s\S]*?churchName=\{churchName\}[\s\S]*?className="h-10 w-10 rounded-panel"/)

  assert.match(logoComponent, /^"use client"/)
  assert.match(logoComponent, /church-logo-updated/)
  assert.match(logoComponent, /onError=\{\(\) => setHasError\(true\)\}/)
})

test("member portal fetches and renders church logo in header", () => {
  const memberData = read("src/lib/member/data.ts")
  const memberLayout = read("src/app/(member)/membro/layout.tsx")
  const memberShell = read("src/components/member/member-shell.tsx")

  assert.match(memberData, /left join public\.church_profiles cp/i)
  assert.match(memberData, /left join public\.app_files logo/i)
  assert.match(memberData, /churchLogoUrl/)
  assert.match(memberData, /createSignedUrlsByStoragePath/)

  assert.match(memberLayout, /churchLogoUrl/)
  assert.match(memberLayout, /churchLogoUrl=\{churchLogoUrl\}/)

  assert.match(memberShell, /import \{ ChurchLogo \} from "@\/components\/layout\/church-logo"/)
  assert.match(memberShell, /churchLogoUrl\?: string \| null/)
  assert.match(memberShell, /<ChurchLogo[\s\S]*?logoUrl=\{churchLogoUrl\}[\s\S]*?churchName=\{churchName\}[\s\S]*?className="h-10 w-10 rounded-2xl"/)
})

test("church logo upload triggers real-time event and layout revalidation", () => {
  const churchInfoClient = read("src/app/(dashboard)/informacoes/church-info-client.tsx")
  const filesActions = read("src/lib/files/actions.ts")
  const churchInfoActions = read("src/lib/church-info/actions.ts")

  assert.match(churchInfoClient, /window\.dispatchEvent\(new CustomEvent\("church-logo-updated"/)
  assert.match(filesActions, /paths: \["\/informacoes", "\/dashboard", "\/membro"\]/)
  assert.match(filesActions, /revalidatePath\("\/", "layout"\)/)
  assert.match(churchInfoActions, /revalidatePath\("\/membro"\)/)
  assert.match(churchInfoActions, /revalidatePath\("\/", "layout"\)/)
})
