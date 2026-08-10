import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const read = (path) => readFileSync(path, "utf8")

test("mensagem direta tem migration tenant-scoped, idempotente e protegida", () => {
  const migration = read("supabase/migrations/20260810123000_form_whatsapp_direct.sql")
  assert.match(migration, /after_submit_mode text not null default 'webhook'/)
  assert.match(migration, /whatsapp_instance_id uuid references public\.uazapi_instances\(id\) on delete set null/)
  assert.match(migration, /create table if not exists public\.form_whatsapp_deliveries/)
  assert.match(migration, /constraint form_whatsapp_delivery_key_unique unique \(delivery_key\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /is_company_member\(company_id\)/)
  assert.match(migration, /claim_form_whatsapp_delivery_batch/)
  assert.match(migration, /grant execute on function public\.get_uazapi_instance_credential\(uuid, uuid\) to service_role/)
  assert.match(migration, /vault\.decrypted_secrets/)
  assert.match(migration, /video\/mp4/)
})

test("submit separa webhook de fila direta e não expõe token", () => {
  const actions = read("src/lib/forms/actions.ts")
  const delivery = read("src/lib/forms/direct-delivery.ts")
  assert.match(actions, /form\.after_submit_mode === "direct_message"/)
  assert.match(actions, /enqueueFormWhatsappDelivery/)
  assert.match(actions, /enqueueIntegrationEventSafe/)
  assert.match(delivery, /get_uazapi_instance_credential/)
  assert.match(delivery, /parseJsonbObject\(delivery\.message_snapshot\)/)
  assert.match(delivery, /jsonbParam\(sql, snapshot \?\? messageConfig \?\? \{\}\)/)
  assert.doesNotMatch(delivery, /JSON\.stringify\(snapshot/)
  assert.match(delivery, /headers: \{ "Content-Type": "application\/json", token: credential\.token \}/)
  assert.doesNotMatch(actions, /UAZAPI_INSTANCE_TOKEN/)
  assert.doesNotMatch(delivery, /console\.(log|error).*token/)
})

test("editor e workers cobrem seleção, upload privado, endpoints e retry", () => {
  const panel = read("src/app/(dashboard)/formularios/[id]/form-whatsapp-settings-panel.tsx")
  const builder = read("src/app/(dashboard)/formularios/[id]/form-builder-client.tsx")
  const delivery = read("src/lib/forms/direct-delivery.ts")
  const payload = read("src/lib/forms/direct-message.ts")
  assert.match(panel, /direct_message/)
  assert.match(panel, /uploadFormWhatsappMedia/)
  assert.match(panel, /navigator\.clipboard\.writeText/)
  assert.ok(panel.includes("key={`button-${index}`}"))
  assert.ok(!panel.includes("key={`${index}-${button.label}`}"))
  assert.match(builder, /retryFormWhatsappDeliveryAction/)
  assert.match(builder, /Mensagens diretas/)
  assert.match(payload, /\/send\/text/)
  assert.match(payload, /\/send\/menu/)
  assert.match(payload, /\/send\/carousel/)
  assert.match(delivery, /attempts = 0/)
})

test("reconexão reaproveita registro antigo pelo provider_instance_id", () => {
  const actions = read("src/lib/uazapi/actions.ts")
  assert.match(actions, /where company_id = \$\{input\.companyId\}[\s\S]*provider_instance_id = \$\{input\.provider\.id\}/)
  assert.match(actions, /on conflict \(company_id, provider_instance_id\) do update/)
  assert.match(actions, /active = true/)
  assert.doesNotMatch(actions, /connectExistingUazapiInstance[\s\S]*assertQuotaAvailable\(companyId\)/)
})
