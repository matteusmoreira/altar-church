import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"

const envPath = path.join(process.cwd(), ".env.local")
const TEST_TENANT_SLUG = "e2e-test"
const TEST_TENANT_NAME = "Tenant E2E (testes automatizados)"

function readKeyValueFile(filePath) {
  if (!existsSync(filePath)) return { ...process.env }

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const index = line.indexOf("=")
      if (index > 0) acc[line.slice(0, index).trim()] = line.slice(index + 1).trim()
      return acc
    }, {})
}

function requiredLegacyId() {
  const legacyId = process.env.E2E_COMPANY_LEGACY_ID?.trim()
  if (!legacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID obrigatório; o script provisiona exatamente o tenant configurado")
  }
  return legacyId
}

async function main() {
  const env = { ...process.env, ...readKeyValueFile(envPath) }
  const legacyId = requiredLegacyId()
  const sql = postgres(env.POSTGRES_URL, { max: 1, idle_timeout: 5, connect_timeout: 10, prepare: false })

  try {
    const [existing] = await sql`
      select id, name, slug, status, active
      from public.companies
      where legacy_id = ${legacyId}
      limit 1
    `
    if (existing) {
      if (existing.status !== "test") {
        throw new Error(`Empresa com legacy_id ${legacyId} existe com status=${existing.status}; o script só provisiona tenant status=test`)
      }
      console.log(`tenant de teste ok: ${existing.id} (${existing.name}, slug=${existing.slug}, active=${existing.active})`)
      return
    }

    const [slugOwner] = await sql`
      select id, legacy_id
      from public.companies
      where slug = ${TEST_TENANT_SLUG}
      limit 1
    `
    if (slugOwner) {
      throw new Error(`Slug ${TEST_TENANT_SLUG} já pertence à empresa ${slugOwner.id} (legacy_id=${slugOwner.legacy_id ?? "null"})`)
    }

    const [created] = await sql`
      insert into public.companies (legacy_id, name, slug, status, active)
      values (${legacyId}, ${TEST_TENANT_NAME}, ${TEST_TENANT_SLUG}, 'test', true)
      returning id, name, slug, status, active
    `
    console.log(`tenant de teste criado: ${created.id} (${created.name}, slug=${created.slug}, status=${created.status}, active=${created.active})`)
  } finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
