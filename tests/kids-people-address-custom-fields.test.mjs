import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("People derives Kids roles and exposes badges and filter", () => {
  const data = read("src/lib/people/data.ts")
  const client = read("src/app/(dashboard)/pessoas/members-client.tsx")
  const detail = read("src/app/(dashboard)/pessoas/[id]/member-detail-client.tsx")

  assert.match(data, /exists \(select 1 from public\.kid_profiles/)
  assert.match(data, /exists \(select 1 from public\.kid_guardians/)
  assert.match(data, /kidsRole/)
  assert.match(client, /Criança Kids/)
  assert.match(client, /Responsável Kids/)
  assert.match(detail, /person\.kidsRoles/)
})

test("Kids uses full child name in internal, public and family forms", () => {
  const schemas = read("src/lib/kids/schemas.ts")
  const actions = read("src/lib/kids/actions.ts")
  const publicForm = read("src/app/(public)/kids/cadastro/[slug]/cadastro-client.tsx")
  const familyForm = read("src/app/(portal)/familia/kids/familia-kids-client.tsx")

  assert.match(schemas, /fullName: z\.string\(\).*Nome completo obrigatório/)
  assert.match(actions, /splitFullName\(parsed\.fullName\)/)
  assert.match(publicForm, /childFullName/)
  assert.match(familyForm, /childForm\.fullName/)
  assert.doesNotMatch(publicForm, /childFirstName|childLastName/)
})

test("optional family address uses ViaCEP and public dedup does not overwrite", () => {
  const migration = read("supabase/migrations/20260718130000_kids_people_origin_address_custom_fields.sql")
  const route = read("src/app/api/cep/[cep]/route.ts")
  const component = read("src/components/kids/address-fields.tsx")
  const publicActions = read("src/lib/kids/portal-actions.ts")

  for (const column of ["postal_code", "address_number", "address_complement", "neighborhood"]) assert.match(migration, new RegExp(column))
  assert.match(route, /https:\/\/viacep\.com\.br\/ws\/\$\{digits\}\/json\//)
  assert.match(component, /Preencha manualmente/)
  assert.match(publicActions, /if \(createdGuardian\) await saveKidCustomValues/)
  assert.doesNotMatch(publicActions, /if \(guardianPersonId\)[\s\S]{0,300}update public\.people/)
})

test("Kids custom field builder supports targets, surfaces, validation and soft delete", () => {
  const migration = read("supabase/migrations/20260718130000_kids_people_origin_address_custom_fields.sql")
  const fields = read("src/lib/kids/custom-fields.ts")
  const actions = read("src/lib/kids/custom-field-actions.ts")
  const builder = read("src/components/kids/custom-field-builder.tsx")

  assert.match(migration, /source_module/)
  assert.match(migration, /show_in_kids_internal/)
  assert.match(migration, /'textarea', 'number'.*'boolean'/)
  assert.match(fields, /validateKidCustomValues/)
  assert.match(fields, /Campo personalizado inválido/)
  assert.match(actions, /kids\.settings\.manage/)
  assert.match(actions, /deleted_at = now\(\), is_active = false/)
  assert.match(builder, /Painel interno/)
  assert.match(builder, /Link público/)
  assert.match(builder, /Portal Família/)
})

