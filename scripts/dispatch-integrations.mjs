/**
 * Chama POST /api/internal/integrations/dispatch
 * Uso:
 *   INTEGRATIONS_BASE_URL=http://localhost:3000 node scripts/dispatch-integrations.mjs
 * Carrega .env.local (INTEGRATION_WORKER_SECRET, E2E_BASE_URL).
 */
import fs from "node:fs"
import path from "node:path"

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local")
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnvLocal()

const base =
  process.env.INTEGRATIONS_BASE_URL ||
  process.env.E2E_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "http://localhost:3000"

const secret = process.env.INTEGRATION_WORKER_SECRET
if (!secret) {
  console.error("INTEGRATION_WORKER_SECRET não definido")
  process.exit(1)
}

const batchSize = Number(process.env.INTEGRATION_BATCH_SIZE || "25")
const url = `${base.replace(/\/$/, "")}/api/internal/integrations/dispatch`

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-integration-worker-secret": secret,
  },
  body: JSON.stringify({ batchSize }),
})

const text = await res.text()
let body
try {
  body = JSON.parse(text)
} catch {
  body = text
}

if (!res.ok) {
  console.error("dispatch failed", res.status, body)
  process.exit(1)
}

console.log("dispatch ok", body)
