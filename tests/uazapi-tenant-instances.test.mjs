import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("Uazapi usa instâncias por igreja, quota do plano e tokens no Vault", () => {
  const migration = read("supabase/migrations/20260719233000_uazapi_tenant_instances.sql")
  assert.match(migration, /uazapi_instance_limit/)
  assert.match(migration, /create table if not exists public\.uazapi_instances/)
  assert.match(migration, /vault_secret_id/)
  assert.match(migration, /get_company_uazapi_credential/)
  assert.match(migration, /role in \('admin', 'superadmin'\)/)
  const tableDefinition = migration.match(
    /create table if not exists public\.uazapi_instances \(([\s\S]*?)\n\);/,
  )?.[1]
  assert.ok(tableDefinition)
  assert.doesNotMatch(tableDefinition, /\btoken\b/)
})

test("painel permite criar e vincular token somente pelo backend", () => {
  const actions = read("src/lib/uazapi/actions.ts")
  const panel = read("src/app/(dashboard)/configuracoes/uazapi-instances-panel.tsx")
  assert.match(actions, /UAZAPI_ADMIN_TOKEN/)
  assert.match(actions, /pg_advisory_xact_lock/)
  assert.match(actions, /vault\.create_secret/)
  assert.match(actions, /Somente administradores da igreja/)
  assert.match(panel, /Criar nova instância/)
  assert.match(panel, /Conectar instância existente/)
  assert.match(panel, /data\.used < data\.limit/)
})

test("workers resolvem token pelo company_id e não usam token global", () => {
  const volunteer = read("supabase/functions/volunteer-delivery-worker/index.ts")
  const kids = read("src/lib/kids/delivery.ts")
  assert.match(volunteer, /get_company_uazapi_credential/)
  assert.match(volunteer, /delivery\.company_id/)
  assert.doesNotMatch(volunteer, /UAZAPI_INSTANCE_TOKEN/)
  assert.match(kids, /getCompanyUazapiCredential\(row\.company_id\)/)
  assert.doesNotMatch(kids, /process\.env\.UAZAPI_INSTANCE_TOKEN/)
})
