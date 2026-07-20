import { existsSync, readFileSync } from "node:fs"
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

function buildDefaultAccountDocument(): E2EAccountDocument {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")

  const password = process.env.E2E_DEFAULT_PASSWORD
  if (!password) {
    throw new Error("E2E_DEFAULT_PASSWORD nao configurado no ambiente")
  }
  const companyLegacyId = process.env.E2E_COMPANY_LEGACY_ID ?? "c1"

  return {
    baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    supabaseProjectRef: process.env.SUPABASE_PROJECT_REF ?? new URL(supabaseUrl).hostname.split(".")[0],
    supabaseUrl,
    companyLegacyId,
    accounts: {
      superadmin: {
        email: process.env.E2E_SUPERADMIN_EMAIL ?? "e2e.superadmin@altar-church.test",
        password,
        role: "superadmin",
        name: "Superadmin E2E",
        companyLegacyId: null,
      },
      admin: {
        email: process.env.E2E_ADMIN_EMAIL ?? "e2e.admin@altar-church.test",
        password,
        role: "admin",
        name: "Admin E2E",
        companyLegacyId,
      },
      member: {
        email: process.env.E2E_MEMBER_EMAIL ?? "e2e.membro@altar-church.test",
        password,
        role: "member",
        name: "Membro E2E",
        companyLegacyId,
      },
    },
  }
}

export function readE2EAccounts(docPath = process.env.E2E_ACCOUNTS_DOC ?? defaultDocPath): E2EAccountDocument {
  if (!existsSync(docPath)) return buildDefaultAccountDocument()

  const content = readFileSync(docPath, "utf8")
  const match = content.match(/```json\s*([\s\S]*?)```/)

  if (!match) {
    throw new Error(`Bloco JSON nao encontrado no doc E2E: ${docPath}`)
  }

  const document = JSON.parse(match[1]) as E2EAccountDocument
  document.accounts.member.role = "member"
  return document
}
