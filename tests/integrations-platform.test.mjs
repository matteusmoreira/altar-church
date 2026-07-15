import assert from "node:assert/strict"
import { createHash, createHmac, randomBytes } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const root = fileURLToPath(new URL("..", import.meta.url))
const read = (rel) => readFileSync(join(root, rel), "utf8")

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (entry === "route.ts") files.push(full)
  }
  return files
}

// Pure crypto helpers mirrored from src/lib/integrations/crypto.ts
function generateApiKeySecret() {
  return `ack_live_${randomBytes(32).toString("base64url")}`
}
function hashApiKey(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex")
}
function signWebhookBody(secret, timestamp, rawBody) {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")
  return `sha256=${digest}`
}
function isPrivateOrLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") return true
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    const [a, b] = parts
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}

test("integration HMAC signature is stable and verifiable", () => {
  const secret = "test-secret-32-chars-minimum!!"
  const body = JSON.stringify({ type: "form.submitted", data: { phone: "+5511999999999" } })
  const ts = "1710000000"
  const sig = signWebhookBody(secret, ts, body)
  assert.match(sig, /^sha256=[a-f0-9]{64}$/)
  assert.equal(signWebhookBody(secret, ts, body), sig)
  assert.notEqual(signWebhookBody(secret, ts, body + "x"), sig)
})

test("API key hash is one-way and prefix-friendly", () => {
  const secret = generateApiKeySecret()
  assert.match(secret, /^ack_live_/)
  const hash = hashApiKey(secret)
  assert.equal(hash.length, 64)
  assert.notEqual(hash, secret)
  assert.equal(hashApiKey(secret), hash)
})

test("SSRF guard flags private hosts", () => {
  assert.equal(isPrivateOrLocalHostname("127.0.0.1"), true)
  assert.equal(isPrivateOrLocalHostname("10.0.0.5"), true)
  assert.equal(isPrivateOrLocalHostname("192.168.1.1"), true)
  assert.equal(isPrivateOrLocalHostname("169.254.169.254"), true)
  assert.equal(isPrivateOrLocalHostname("localhost"), true)
  assert.equal(isPrivateOrLocalHostname("hooks.example.com"), false)
})

test("migration defines integrations tables and claim function", () => {
  const migration = read("supabase/migrations/20260715120000_integrations_platform.sql")
  assert.match(migration, /integration_webhook_endpoints/)
  assert.match(migration, /integration_delivery_outbox/)
  assert.match(migration, /api_keys/)
  assert.match(migration, /claim_integration_delivery_batch/)
})

test("integrations lib and routes exist", () => {
  const enqueue = read("src/lib/integrations/enqueue.ts")
  assert.match(enqueue, /enqueueIntegrationEvent/)
  assert.match(enqueue, /form_id is null or form_id/)

  const deliver = read("src/lib/integrations/deliver.ts")
  assert.match(deliver, /processIntegrationOutbox/)
  assert.match(deliver, /X-Altar-Signature/)

  const auth = read("src/lib/api/auth.ts")
  assert.match(auth, /requireApiAuth/)
  assert.match(auth, /ack_/)

  const submit = read("src/lib/forms/actions.ts")
  assert.match(submit, /form\.submitted/)
  assert.match(submit, /enqueueIntegrationEventSafe/)
  // aliases canônicos para {{nome}} / {{telefone}} no Altar Chat
  assert.match(submit, /templateFields\.nome/)
  assert.match(submit, /templateFields\.telefone/)

  const apiRoot = join(root, "src/app/api/v1")
  const routes = walk(apiRoot).map((r) => r.replace(/\\/g, "/"))
  for (const suffix of [
    "/forms/route.ts",
    "/forms/[id]/submissions/route.ts",
    "/integrations/webhooks/route.ts",
    "/integrations/api-keys/route.ts",
    "/integrations/deliveries/route.ts",
  ]) {
    assert.ok(
      routes.some((p) => p.endsWith(`/api/v1${suffix}`) || p.endsWith(`v1${suffix}`)),
      `missing ${suffix}`,
    )
  }

  const dispatch = read("src/app/api/internal/integrations/dispatch/route.ts")
  assert.match(dispatch, /INTEGRATION_WORKER_SECRET/)
})

test("OpenAPI documents integrations and bearerAuth", () => {
  const openapi = read("docs/api/openapi.yaml")
  assert.match(openapi, /bearerAuth/)
  assert.match(openapi, /\/forms/)
  assert.match(openapi, /\/integrations\/webhooks/)
  assert.match(openapi, /ack_live/)
})
