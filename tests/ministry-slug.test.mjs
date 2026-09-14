import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), "utf8")

test("slugifyMinistry normalizes names and strips common prefixes", async () => {
  const { slugifyMinistry, normalizeMinistrySlug } = await import("../src/lib/ministries/slug.ts")

  assert.equal(slugifyMinistry("Ministério de Homens"), "homens")
  assert.equal(slugifyMinistry("Ministério de Casais"), "casais")
  assert.equal(slugifyMinistry("Ministério da Família"), "familia")
  assert.equal(slugifyMinistry("Ministério dos Jovens"), "jovens")
  assert.equal(slugifyMinistry("Ministério das Mulheres"), "mulheres")
  assert.equal(slugifyMinistry("Ministério Infantil"), "infantil")
  assert.equal(slugifyMinistry("Min. de Homens"), "homens")
  assert.equal(slugifyMinistry("Min de Louvor"), "louvor")
  assert.equal(slugifyMinistry("Louvor & Adoração"), "louvor-adoracao")
  assert.equal(slugifyMinistry("Ministério"), "ministerio")
  assert.equal(slugifyMinistry(""), "ministerio")

  assert.equal(normalizeMinistrySlug("Homens Fortes"), "homens-fortes")
  assert.equal(normalizeMinistrySlug("Células & Ação!"), "celulas-acao")
})

test("migration creates slug column and unique index per company", () => {
  const migration = read("supabase/migrations/20260914170000_ministries_friendly_slug.sql")
  assert.match(migration, /add column if not exists slug text/i)
  assert.match(migration, /ministries_company_slug_unique/i)
  assert.match(migration, /ministries_slug_format/i)
})

test("resolveMinistryAccess accepts both UUID and friendly slug", () => {
  const access = read("src/lib/ministries/access.ts")
  assert.match(access, /UUID_REGEX/)
  assert.match(access, /resolveMinistryAccess\(ministryIdOrSlug: string/)
  assert.match(access, /lower\(slug\) = lower\(\$\{cleanedIdentifier\}\)/)
  assert.match(access, /where id = \$\{cleanedIdentifier\}/)
})

test("page.tsx redirects UUID access to canonical friendly slug", () => {
  const page = read("src/app/(dashboard)/ministerios/[id]/page.tsx")
  assert.match(page, /redirect\(`\/ministerios\/\$\{friendlySlug\}`\)/)
})

test("ministries client and workspace expose slug configuration", () => {
  const client = read("src/app/(dashboard)/ministerios/ministries-client.tsx")
  assert.match(client, /Link de acesso amigável/)
  assert.match(client, /slugifyMinistry/)

  const workspace = read("src/components/ministries/ministry-workspace.tsx")
  assert.match(workspace, /Link amigável \(slug\)/)
  assert.match(workspace, /\/ministerios\/\{profile\.slug\}/)
})

test("database query resolves ministry by both UUID and friendly slug", async (t) => {
  if (!process.env.POSTGRES_URL) return t.skip("POSTGRES_URL não configurado")
  const { default: postgres } = await import("postgres")
  const sql = postgres(process.env.POSTGRES_URL)

  try {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const targetUuid = "232f976e-c0e0-4788-9060-d721181d824a"
    const targetSlug = "homens"

    const rowsByUuid = await sql`
      select id, name, slug from public.ministries where id = ${targetUuid} and deleted_at is null
    `
    assert.equal(rowsByUuid.length, 1)
    assert.equal(rowsByUuid[0].name, "Ministério de Homens")
    assert.equal(rowsByUuid[0].slug, "homens")

    const rowsBySlug = await sql`
      select id, name, slug from public.ministries where slug = ${targetSlug} and deleted_at is null
    `
    assert.equal(rowsBySlug.length, 1)
    assert.equal(rowsBySlug[0].id, targetUuid)
    assert.equal(rowsBySlug[0].name, "Ministério de Homens")

    const rowsByUppercaseSlug = await sql`
      select id, name, slug from public.ministries where lower(slug) = lower('Homens') and deleted_at is null
    `
    assert.equal(rowsByUppercaseSlug.length, 1)
    assert.equal(rowsByUppercaseSlug[0].id, targetUuid)
  } finally {
    await sql.end()
  }
})

