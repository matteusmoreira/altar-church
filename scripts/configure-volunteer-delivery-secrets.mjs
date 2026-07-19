import { randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import path from "node:path"
import webpush from "web-push"

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF
if (!accessToken || !projectRef) throw new Error("Credenciais Supabase ausentes")

const vapid = webpush.generateVAPIDKeys()
const workerSecret = randomBytes(32).toString("base64url")
const npxCommand = `"${path.join(path.dirname(process.execPath), "npx.cmd")}"`
const secrets = [
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", value: vapid.publicKey },
  { name: "VAPID_PRIVATE_KEY", value: vapid.privateKey },
  { name: "VAPID_SUBJECT", value: "mailto:suporte@altarchurch.com.br" },
  { name: "VOLUNTEER_WORKER_SECRET", value: workerSecret },
]

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(secrets),
})
if (!response.ok) {
  throw new Error(
    `Supabase recusou Edge Function Secrets (${response.status}). Use token Owner/Developer do projeto.`,
  )
}

const vercel = spawnSync(
  `${npxCommand} vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production,preview,development --force --yes`,
  [],
  { cwd: process.cwd(), input: `${vapid.publicKey}\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], shell: true },
)
if (vercel.status !== 0) throw new Error(`Vercel env: ${vercel.stderr || vercel.stdout}`)

console.log("VAPID e segredo do worker configurados sem expor valores")
