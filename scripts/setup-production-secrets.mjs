/**
 * Configura todos os secrets de produção no Supabase.
 *
 * Uso:
 *   node scripts/setup-production-secrets.mjs
 *
 * Opcionais (via env ou flags):
 *   RESEND_API_KEY, RESEND_FROM_EMAIL
 *
 * Tokens Uazapi são armazenados por igreja no Supabase Vault.
 */
import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvLocal() {
  const file = path.join(root, ".env.local")
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${projectRef}.supabase.co`
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!accessToken) { console.error("SUPABASE_ACCESS_TOKEN obrigatório"); process.exit(1) }
if (!serviceRole) { console.error("SUPABASE_SERVICE_ROLE_KEY obrigatório"); process.exit(1) }

const integrationWorkerSecret = process.env.INTEGRATION_WORKER_SECRET
if (!integrationWorkerSecret) { console.error("INTEGRATION_WORKER_SECRET obrigatório"); process.exit(1) }

// Gerar VAPID keys via crypto (formato base64url de curvas P-256)
async function generateVapidKeys() {
  try {
    const { default: webpush } = await import("web-push")
    return webpush.generateVAPIDKeys()
  } catch {
    console.warn("web-push não disponível, gerando VAPID via SubtleCrypto...")
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )
    const publicRaw = await globalThis.crypto.subtle.exportKey("raw", keyPair.publicKey)
    const privateJwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.privateKey)
    return {
      publicKey: Buffer.from(publicRaw).toString("base64url"),
      privateKey: privateJwk.d,
    }
  }
}

const volunteerWorkerSecret =
  process.env.VOLUNTEER_WORKER_SECRET || randomBytes(32).toString("base64url")
const existingVapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const existingVapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapid =
  existingVapidPublicKey && existingVapidPrivateKey
    ? { publicKey: existingVapidPublicKey, privateKey: existingVapidPrivateKey }
    : await generateVapidKeys()

console.log("=== Setup Production Secrets ===")
console.log(`Project: ${projectRef}`)
console.log(`Supabase URL: ${supabaseUrl}`)
console.log("")

// 1. Configurar Secrets na Edge Functions do Supabase
// Nota: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente pelo runtime
const secrets = [
  { name: "INTEGRATION_WORKER_SECRET", value: integrationWorkerSecret },
  { name: "INTEGRATION_WEBHOOK_HTTPS_ONLY", value: "1" },
  { name: "VOLUNTEER_WORKER_SECRET", value: volunteerWorkerSecret },
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: vapid.publicKey },
  { name: "VAPID_PRIVATE_KEY", value: vapid.privateKey },
  { name: "VAPID_SUBJECT", value: "mailto:suporte@altarchurch.com.br" },
]

// Adicionar Resend se disponível
const resendKey = process.env.RESEND_API_KEY
const resendFrom = process.env.RESEND_FROM_EMAIL
if (resendKey && resendFrom) {
  secrets.push({ name: "RESEND_API_KEY", value: resendKey })
  secrets.push({ name: "RESEND_FROM_EMAIL", value: resendFrom })
  console.log("✅ Resend: credenciais configuradas")
} else {
  console.warn("⚠️  Resend: sem credenciais — e-mail ficará em modo graceful-fail")
}

console.log("")
console.log("--- Configurando Supabase Edge Function Secrets ---")

const secretsResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(secrets),
})

if (!secretsResponse.ok) {
  const body = await secretsResponse.text()
  console.error(`❌ Supabase Secrets falhou (${secretsResponse.status}): ${body}`)
  process.exit(1)
}

console.log(`✅ ${secrets.length} secrets configurados no Supabase`)

// 2. Verificar secrets configurados
const verifyResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  headers: { Authorization: `Bearer ${accessToken}` },
})
if (verifyResponse.ok) {
  const allSecrets = await verifyResponse.json()
  console.log(`\n--- Secrets no projeto (${allSecrets.length} total) ---`)
  for (const s of allSecrets) {
    console.log(`  ${s.name}: ✅ (atualizado: ${s.updated_at})`)
  }
}

// 3. Salvar valores gerados localmente para referência
console.log("\nSegredos gerados/preservados sem exibir valores")

// 4. Atualizar .env.local com os novos valores
const envLocalPath = path.join(root, ".env.local")
let envContent = fs.readFileSync(envLocalPath, "utf8")

// Adicionar VOLUNTEER_WORKER_SECRET se não existir
if (!envContent.includes("VOLUNTEER_WORKER_SECRET=")) {
  envContent = envContent.trimEnd() + `\nVOLUNTEER_WORKER_SECRET=${volunteerWorkerSecret}\n`
}

// Adicionar VAPID keys se não existir
if (!envContent.includes("NEXT_PUBLIC_VAPID_PUBLIC_KEY=")) {
  envContent = envContent.trimEnd() + `\nNEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}\n`
}
if (!envContent.includes("VAPID_PRIVATE_KEY=")) {
  envContent = envContent.trimEnd() + `\nVAPID_PRIVATE_KEY=${vapid.privateKey}\n`
}
if (!envContent.includes("VAPID_SUBJECT=")) {
  envContent = envContent.trimEnd() + `\nVAPID_SUBJECT=mailto:suporte@altarchurch.com.br\n`
}

fs.writeFileSync(envLocalPath, envContent, "utf8")
console.log("\n✅ .env.local atualizado com VAPID e VOLUNTEER_WORKER_SECRET")

console.log("\n=== Setup Production Secrets CONCLUÍDO ===")
