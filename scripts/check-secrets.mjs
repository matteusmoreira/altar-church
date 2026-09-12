#!/usr/bin/env node
/**
 * Scanner de segredos para arquivos rastreados pelo Git.
 *
 * Objetivo: impedir que credenciais voltem a ser versionadas. Roda sem
 * dependências externas para poder ser executado no CI e localmente.
 *
 * Uso:
 *   node scripts/check-secrets.mjs
 *   npm run secrets:check
 *
 * Para liberar uma linha legítima (ex.: regex de teste), inclua o comentário
 * `secret-scan-allow` na mesma linha.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const ALLOW_MARKER = "secret-scan-allow"

const PATTERNS = [
  { name: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "Supabase publishable/secret key", re: /sb_(?:publishable|secret)_[A-Za-z0-9_-]{12,}/g },
  { name: "Supabase access token", re: /sbp_[A-Za-z0-9_]{20,}/g },
  { name: "Resend API key", re: /\bre_[A-Za-z0-9_]{20,}/g },
  { name: "Vercel token", re: /\bvcp_[A-Za-z0-9]{20,}/g },
  { name: "Stripe secret key", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: "Altar API key", re: /\back_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: "Chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
]

const SKIP_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".pdf",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".webm", ".zip", ".gz",
]

function listTrackedFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  return output.split("\0").filter(Boolean)
}

function shouldSkip(filePath) {
  const lower = filePath.toLowerCase()
  if (lower === "scripts/check-secrets.mjs") return true
  return SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function mask(value) {
  if (value.length <= 12) return `${value.slice(0, 4)}…`
  return `${value.slice(0, 8)}…${value.slice(-4)}`
}

const findings = []

for (const filePath of listTrackedFiles()) {
  if (shouldSkip(filePath)) continue

  let content
  try {
    content = readFileSync(filePath, "utf8")
  } catch {
    continue
  }

  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0
      const match = re.exec(line)
      if (match) {
        findings.push({ filePath, line: index + 1, name, sample: mask(match[0]) })
      }
    }
  })
}

if (findings.length === 0) {
  console.log("check-secrets: nenhum segredo encontrado nos arquivos rastreados ✓")
  process.exit(0)
}

console.error(`check-secrets: ${findings.length} possível(is) segredo(s) em arquivos rastreados:\n`)
for (const f of findings) {
  console.error(`  ${f.filePath}:${f.line}  [${f.name}]  ${f.sample}`)
}
console.error(
  "\nRemova o valor do código e leia-o de process.env. Se a linha for legítima, " +
    `adicione o comentário ${ALLOW_MARKER}.`,
)
process.exit(1)
