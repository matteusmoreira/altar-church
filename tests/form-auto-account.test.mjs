import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(path, "utf8")

const migration = read("supabase/migrations/20260811120000_form_auto_account.sql")
const types = read("src/lib/forms/types.ts")
const data = read("src/lib/forms/data.ts")
const actions = read("src/lib/forms/actions.ts")
const account = read("src/lib/forms/account-provisioning.ts")
const builder = read("src/app/(dashboard)/formularios/[id]/form-builder-client.tsx")
const createRoute = read("src/app/api/v1/forms/route.ts")
const updateRoute = read("src/app/api/v1/forms/[id]/route.ts")

test("configuração de criação de conta é aditiva e desligada por padrão", () => {
  assert.match(migration, /add column if not exists create_account_after_submit boolean not null default false/i)
  assert.match(types, /createAccountAfterSubmit: boolean/)
  assert.match(types, /createAccountAfterSubmit\?: boolean/)
  assert.match(data, /create_account_after_submit/)
  assert.match(data, /createAccountAfterSubmit: row\.create_account_after_submit/)
})

test("builder e APIs preservam a opção e forçam criação de Pessoa", () => {
  assert.match(builder, /Criar conta de usuário após preenchimento\?/) 
  assert.match(builder, /checked=\{createAccountAfterSubmit\}/)
  assert.match(builder, /disabled=\{createAccountAfterSubmit\}/)
  assert.match(actions, /create_person = \$\{parsed\.createPerson \|\| createAccountAfterSubmit\}/)
  assert.match(actions, /create_account_after_submit = \$\{createAccountAfterSubmit\}/)
  assert.match(createRoute, /createAccountAfterSubmit/)
  assert.match(updateRoute, /createAccountAfterSubmit/)
})

test("servidor exige nome e telefone mapeados, obrigatórios e valida novamente no envio", () => {
  assert.match(actions, /function accountFieldConfigurationError/)
  assert.match(actions, /nameFields\.length !== 1/)
  assert.match(actions, /phoneFields\[0\]\?\.field_type !== "phone"/)
  assert.match(actions, /assertFormAccountFieldsReady/)
  assert.match(actions, /submitPublicFormWithAccount/)
  assert.match(actions, /normalizeBrazilianWhatsapp\(input\.personPhone\)/)
  assert.match(actions, /if \(form\.create_account_after_submit\)/)
})

test("provisionamento gera senha descartavel aleatoria e compensa falhas de banco", () => {
  assert.match(account, /randomBytes\(32\)\.toString\("base64url"\)/)
  assert.match(account, /password: generateDisposablePassword\(\)/)
  assert.doesNotMatch(account, /FORM_AUTO_ACCOUNT_PASSWORD/)
  assert.doesNotMatch(account, /@mudar123/)
  assert.match(account, /accounts\.altar-church\.invalid/)
  assert.match(account, /auth\.admin\.createUser/)
  assert.match(account, /auth\.admin\.deleteUser/)
  assert.match(account, /sameChurchPeople\.length > 1/)
  assert.match(account, /otherChurchPeople\.length > 0/)
  assert.match(actions, /const result = await sql\.begin/)
  assert.match(actions, /deletePreparedAuthUser\(authUserCreatedId\)/)
  assert.match(actions, /form\.account_provisioned/)
  const auditStart = actions.indexOf("'form.account_provisioned'")
  const auditEnd = actions.indexOf("      return {", auditStart)
  assert.ok(auditStart >= 0 && auditEnd > auditStart)
  assert.doesNotMatch(actions.slice(auditStart, auditEnd), /password/i)
})

test("mensagem e integrações só são enfileiradas depois do commit", () => {
  const transactionEnd = actions.indexOf("    authUserCreatedId = null")
  const whatsappQueue = actions.indexOf("enqueueFormWhatsappDelivery", transactionEnd)
  const integrationQueue = actions.indexOf("enqueueIntegrationEventSafe", transactionEnd)
  assert.ok(transactionEnd > 0)
  assert.ok(whatsappQueue > transactionEnd)
  assert.ok(integrationQueue > transactionEnd)
  assert.doesNotMatch(actions.slice(transactionEnd, whatsappQueue), /password|@mudar123/i)
})
