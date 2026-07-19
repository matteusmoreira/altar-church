/**
 * Deploy Edge Functions via Supabase Management API REST.
 * 
 * Uso:
 *   node scripts/deploy-edge-functions.mjs
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

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF || "zsldqioutjxchgmmwtfi"

if (!accessToken) { console.error("SUPABASE_ACCESS_TOKEN obrigatório"); process.exit(1) }

const functions = [
  {
    slug: "integration-delivery-worker",
    name: "Integration Delivery Worker",
    dir: path.join(root, "supabase", "functions", "integration-delivery-worker"),
    entrypoint: "index.ts",
  },
  {
    slug: "volunteer-delivery-worker",
    name: "Volunteer Delivery Worker",
    dir: path.join(root, "supabase", "functions", "volunteer-delivery-worker"),
    entrypoint: "index.ts",
  },
]

async function deployFunction(fn) {
  console.log(`\n--- Deploying: ${fn.slug} ---`)
  
  const filePath = path.join(fn.dir, fn.entrypoint)
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ Arquivo não encontrado: ${filePath}`)
    return false
  }

  const fileContent = fs.readFileSync(filePath)
  const metadata = JSON.stringify({
    entrypoint_path: fn.entrypoint,
    name: fn.name,
  })

  // Build multipart form data manually
  const boundary = `----FormBoundary${Date.now()}`
  const parts = []

  // metadata part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="metadata"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    metadata + `\r\n`
  )

  // file part
  parts.push(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fn.entrypoint}"\r\n` +
    `Content-Type: application/typescript\r\n\r\n`
  )

  const bodyParts = [
    Buffer.from(parts[0]),
    Buffer.from(parts[1]),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]
  const body = Buffer.concat(bodyParts)

  const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${fn.slug}`
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  const responseText = await response.text()
  
  if (response.ok || response.status === 201) {
    console.log(`  ✅ ${fn.slug} deployed (${response.status})`)
    try {
      const data = JSON.parse(responseText)
      if (data.id) console.log(`  Function ID: ${data.id}`)
      if (data.version) console.log(`  Version: ${data.version}`)
    } catch { /* ignore */ }
    return true
  } else {
    console.error(`  ❌ Deploy falhou (${response.status}): ${responseText.slice(0, 500)}`)
    return false
  }
}

console.log("=== Deploy Edge Functions ===")
console.log(`Project: ${projectRef}`)

let success = 0
for (const fn of functions) {
  if (await deployFunction(fn)) success++
}

console.log(`\n=== Resultado: ${success}/${functions.length} functions deployed ===`)

// Verificar functions deployadas
const listResponse = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
  headers: { Authorization: `Bearer ${accessToken}` },
})
if (listResponse.ok) {
  const deployed = await listResponse.json()
  console.log(`\nFunctions no projeto:`)
  for (const f of deployed) {
    console.log(`  ${f.slug}: v${f.version} (status: ${f.status})`)
  }
}

if (success < functions.length) process.exit(1)
