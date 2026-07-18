import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const envPath = resolve(process.cwd(), ".env.local")
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
if (/^KIDS_PIN_PEPPER=.+$/m.test(current)) {
  console.log("KIDS_PIN_PEPPER já configurado; nenhuma alteração feita.")
  process.exit(0)
}

const line = `KIDS_PIN_PEPPER=${randomBytes(48).toString("base64url")}`
const next = /^KIDS_PIN_PEPPER=.*$/m.test(current)
  ? current.replace(/^KIDS_PIN_PEPPER=.*$/m, line)
  : `${current.trimEnd()}${current.trim() ? "\n" : ""}${line}\n`
writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 })
console.log("KIDS_PIN_PEPPER forte criado em .env.local (valor não exibido).")
