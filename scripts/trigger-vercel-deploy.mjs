/**
 * Trigger novo deploy na Vercel usando as env vars atualizadas.
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const projectJsonPath = path.join(root, ".vercel", "project.json")
const projectJson = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"))
const projectId = projectJson.projectId
const teamId = projectJson.orgId
const vercelToken = process.env.VERCEL_TOKEN
if (!vercelToken) {
  console.error("VERCEL_TOKEN obrigatório")
  process.exit(1)
}

console.log("=== Trigger Deploy Vercel ===")
console.log(`Project: ${projectId}`)

// 1. Buscar última deployment para obter git info
const deploysR = await fetch(`https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${teamId}&limit=1`, {
  headers: { Authorization: `Bearer ${vercelToken}` },
})

if (!deploysR.ok) {
  console.error("Falha ao listar deploys:", deploysR.status)
  process.exit(1)
}

const deploys = await deploysR.json()
const latest = deploys.deployments?.[0]

if (latest) {
  console.log(`Último deploy: ${latest.state} — ${latest.url}`)
  console.log(`Criado em: ${new Date(latest.created).toISOString()}`)
}

// 2. Criar novo deploy via redeploy da última
const redeployR = await fetch(`https://api.vercel.com/v13/deployments?teamId=${teamId}&forceNew=1`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${vercelToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "altar-church",
    deploymentId: latest?.uid,
    target: "production",
  }),
})

if (redeployR.ok || redeployR.status === 201) {
  const data = await redeployR.json()
  console.log(`\n✅ Deploy criado!`)
  console.log(`  ID: ${data.id}`)
  console.log(`  URL: ${data.url}`)
  console.log(`  Estado: ${data.readyState || data.state}`)
  console.log(`\nAcompanhe em: https://vercel.com/matteusmoreira/altar-church/deployments`)
} else {
  const body = await redeployR.text()
  console.error(`❌ Redeploy falhou (${redeployR.status}): ${body.slice(0, 500)}`)
  
  // Fallback: tentar criar deployment do zero
  console.log("\nTentando deploy via Vercel CLI...")
  console.log("Execute manualmente: npx vercel --prod --yes")
}
