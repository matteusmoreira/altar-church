/**
 * Publica o estado local validado no projeto Vercel já vinculado.
 * O token é lido de .env.local e nunca impresso.
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env.local")

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const equals = trimmed.indexOf("=")
    if (equals <= 0) continue
    const key = trimmed.slice(0, equals).trim()
    let value = trimmed.slice(equals + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

if (!process.env.VERCEL_TOKEN) {
  console.error("VERCEL_TOKEN obrigatório")
  process.exit(1)
}

const executable = process.platform === "win32" ? "npx.cmd" : "npx"
const child = spawn(
  executable,
  ["vercel", "deploy", "--prod", "--yes", "--token", process.env.VERCEL_TOKEN],
  { cwd: root, stdio: "inherit", windowsHide: true, shell: process.platform === "win32" },
)

child.on("exit", (code) => process.exit(code ?? 1))
