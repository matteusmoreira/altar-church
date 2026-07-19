/**
 * Configura todas as variáveis de ambiente no Vercel.
 * 
 * Uso:
 *   node scripts/setup-vercel-env.mjs
 */
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

const vercelToken = process.env.VERCEL_TOKEN
if (!vercelToken) {
  console.error("VERCEL_TOKEN obrigatório")
  process.exit(1)
}

// Ler project.json para obter IDs
const projectJsonPath = path.join(root, ".vercel", "project.json")
const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"))
const projectId = projectJson.projectId
const teamId = projectJson.orgId

console.log("=== Setup Vercel Environment Variables ===")
console.log(`Project: ${projectId}`)
console.log(`Team: ${teamId}`)

// Variáveis a configurar
const envVars = [
  // Públicas (production + preview + development)
  { key: "NEXT_PUBLIC_SUPABASE_URL", value: process.env.NEXT_PUBLIC_SUPABASE_URL, target: ["production", "preview", "development"], type: "plain" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, target: ["production", "preview", "development"], type: "plain" },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, target: ["production", "preview", "development"], type: "plain" },
  { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, target: ["production", "preview", "development"], type: "plain" },

  // Seguras (production only)
  { key: "SUPABASE_URL", value: process.env.SUPABASE_URL, target: ["production"], type: "encrypted" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY, target: ["production"], type: "encrypted" },
  { key: "SUPABASE_ACCESS_TOKEN", value: process.env.SUPABASE_ACCESS_TOKEN, target: ["production"], type: "encrypted" },
  { key: "SUPABASE_PROJECT_REF", value: process.env.SUPABASE_PROJECT_REF, target: ["production"], type: "encrypted" },
  { key: "POSTGRES_URL", value: process.env.POSTGRES_URL, target: ["production"], type: "encrypted" },
  { key: "INTEGRATION_WORKER_SECRET", value: process.env.INTEGRATION_WORKER_SECRET, target: ["production"], type: "encrypted" },
  { key: "INTEGRATION_WEBHOOK_HTTPS_ONLY", value: "1", target: ["production"], type: "encrypted" },
  { key: "KIDS_HEALTH_ENCRYPTION_KEY", value: process.env.KIDS_HEALTH_ENCRYPTION_KEY, target: ["production"], type: "encrypted" },
  { key: "KIDS_PIN_PEPPER", value: process.env.KIDS_PIN_PEPPER, target: ["production"], type: "encrypted" },
  { key: "VAPID_PRIVATE_KEY", value: process.env.VAPID_PRIVATE_KEY, target: ["production"], type: "encrypted" },
  { key: "VAPID_SUBJECT", value: process.env.VAPID_SUBJECT || "mailto:suporte@altarchurch.com.br", target: ["production"], type: "encrypted" },
  { key: "VOLUNTEER_WORKER_SECRET", value: process.env.VOLUNTEER_WORKER_SECRET, target: ["production"], type: "encrypted" },
  { key: "UAZAPI_BASE_URL", value: process.env.UAZAPI_BASE_URL, target: ["production"], type: "encrypted" },
  { key: "UAZAPI_ADMIN_TOKEN", value: process.env.UAZAPI_ADMIN_TOKEN, target: ["production"], type: "encrypted" },
  { key: "RESEND_API_KEY", value: process.env.RESEND_API_KEY, target: ["production"], type: "encrypted" },
  { key: "RESEND_FROM_EMAIL", value: process.env.RESEND_FROM_EMAIL, target: ["production"], type: "encrypted" },
]

const baseUrl = `https://api.vercel.com/v10/projects/${projectId}/env`
const headers = {
  Authorization: `Bearer ${vercelToken}`,
  "Content-Type": "application/json",
}

// Primeiro, listar variáveis existentes para evitar duplicatas
const listUrl = `${baseUrl}?teamId=${teamId}`
const listResponse = await fetch(listUrl, { headers })
let existingEnvs = []
if (listResponse.ok) {
  const data = await listResponse.json()
  existingEnvs = data.envs || []
  console.log(`\nVariáveis existentes: ${existingEnvs.length}`)
}

let created = 0
let updated = 0
let skipped = 0

for (const env of envVars) {
  if (!env.value) {
    console.warn(`  ⚠️  ${env.key}: sem valor — pulando`)
    skipped++
    continue
  }

  // Verificar se já existe para cada target
  const existing = existingEnvs.find(
    (e) => e.key === env.key && env.target.some((target) => e.target?.includes(target)),
  )

  if (existing) {
    // Update via PATCH
    const patchUrl = `https://api.vercel.com/v9/projects/${projectId}/env/${existing.id}?teamId=${teamId}`
    const patchResponse = await fetch(patchUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        value: env.value,
        target: env.target,
        type: existing.type,
      }),
    })
    if (patchResponse.ok) {
      console.log(`  ✅ ${env.key}: atualizado`)
      updated++
    } else {
      const errorText = await patchResponse.text()
      console.error(`  ❌ ${env.key}: update falhou (${patchResponse.status}) — ${errorText.slice(0, 200)}`)
    }
  } else {
    // Create via POST
    const createUrl = `${baseUrl}?teamId=${teamId}`
    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        key: env.key,
        value: env.value,
        target: env.target,
        type: env.type,
      }),
    })
    if (createResponse.ok) {
      console.log(`  ✅ ${env.key}: criado`)
      created++
    } else {
      const errorText = await createResponse.text()
      // Se erro é duplicata, tentar upsert
      if (createResponse.status === 400 && errorText.includes("already exists")) {
        console.log(`  ⚠️  ${env.key}: já existe, tentando upsert...`)
        const upsertUrl = `${baseUrl}?teamId=${teamId}&upsert=true`
        const upsertResponse = await fetch(upsertUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            key: env.key,
            value: env.value,
            target: env.target,
            type: env.type,
          }),
        })
        if (upsertResponse.ok) {
          console.log(`  ✅ ${env.key}: upsert OK`)
          updated++
        } else {
          console.error(`  ❌ ${env.key}: upsert falhou (${upsertResponse.status})`)
        }
      } else {
        console.error(`  ❌ ${env.key}: create falhou (${createResponse.status}) — ${errorText.slice(0, 200)}`)
      }
    }
  }
}

console.log(`\n=== Resultado: ${created} criados, ${updated} atualizados, ${skipped} sem valor ===`)

// Verificar o total final
const finalResponse = await fetch(listUrl, { headers })
if (finalResponse.ok) {
  const data = await finalResponse.json()
  console.log(`\nTotal de variáveis no Vercel: ${(data.envs || []).length}`)
  for (const e of (data.envs || [])) {
    console.log(`  ${e.key}: ${e.target?.join(", ")} (${e.type})`)
  }
}

console.log("\n=== Setup Vercel Env CONCLUÍDO ===")
