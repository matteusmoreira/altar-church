import { readFileSync } from "node:fs"
import path from "node:path"

export type E2ERole = "superadmin" | "admin" | "member"

export interface E2EAccount {
  email: string
  password: string
  role: string
  name: string
  companyLegacyId: string | null
}

export interface E2EAccountDocument {
  baseUrl: string
  supabaseProjectRef: string
  supabaseUrl: string
  companyLegacyId: string
  accounts: Record<E2ERole, E2EAccount>
}

const defaultDocPath = path.join(process.cwd(), "docs", "testing", "e2e-accounts.local.md")

export function readE2EAccounts(docPath = process.env.E2E_ACCOUNTS_DOC ?? defaultDocPath): E2EAccountDocument {
  const content = readFileSync(docPath, "utf8")
  const match = content.match(/```json\s*([\s\S]*?)```/)

  if (!match) {
    throw new Error(`Bloco JSON nao encontrado no doc E2E: ${docPath}`)
  }

  return JSON.parse(match[1]) as E2EAccountDocument
}
