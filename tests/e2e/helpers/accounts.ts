import { existsSync, readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
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
  portalAccounts?: Partial<Record<"visitor" | "attendee" | "volunteer" | "ministryLeader" | "ministryLeaderVolunteer", E2EAccount>>
}

const defaultDocPath = path.join(process.cwd(), "docs", "testing", "e2e-accounts.local.md")
const runId = process.env.E2E_RUN_ID?.trim() || `${Date.now()}-${randomUUID().slice(0, 8)}`

export function e2eRunPrefix(scope: string) {
  const safeScope = scope.replace(/[^a-z0-9-]/gi, "-").toLowerCase()
  return `e2e-${runId}-${safeScope}`
}

function buildPortalAccounts(password: string, companyLegacyId: string): NonNullable<E2EAccountDocument["portalAccounts"]> {
  return {
    visitor: { email: process.env.E2E_VISITOR_EMAIL ?? "e2e.visitante@altar-church.test", password, role: "member", name: "Visitante E2E", companyLegacyId },
    attendee: { email: process.env.E2E_ATTENDEE_EMAIL ?? "e2e.frequentador@altar-church.test", password, role: "member", name: "Frequentador E2E", companyLegacyId },
    volunteer: { email: process.env.E2E_VOLUNTEER_EMAIL ?? "e2e.voluntario@altar-church.test", password, role: "volunteer", name: "Voluntário E2E", companyLegacyId },
    ministryLeader: { email: process.env.E2E_MINISTRY_LEADER_EMAIL ?? "e2e.lider-ministerio@altar-church.test", password, role: "ministry_leader", name: "Líder Ministério E2E", companyLegacyId },
    ministryLeaderVolunteer: { email: process.env.E2E_MINISTRY_LEADER_VOLUNTEER_EMAIL ?? "e2e.lider-voluntario@altar-church.test", password, role: "ministry_leader", name: "Líder Voluntário E2E", companyLegacyId },
  }
}

function buildDefaultAccountDocument(): E2EAccountDocument {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")

  const password = process.env.E2E_DEFAULT_PASSWORD
  if (!password) {
    throw new Error("E2E_DEFAULT_PASSWORD nao configurado no ambiente")
  }
  const companyLegacyId = process.env.E2E_COMPANY_LEGACY_ID?.trim()
  if (!companyLegacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID obrigatório; o setup não escolhe tenant por fallback")
  }

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
    portalAccounts: buildPortalAccounts(password, companyLegacyId),
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
  const configuredCompanyLegacyId = process.env.E2E_COMPANY_LEGACY_ID?.trim()
  if (!configuredCompanyLegacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID obrigatório; o setup não escolhe tenant por fallback")
  }
  if (document.companyLegacyId !== configuredCompanyLegacyId) {
    throw new Error("E2E_COMPANY_LEGACY_ID não corresponde ao tenant declarado no documento E2E")
  }
  const accounts = [
    ...Object.values(document.accounts ?? {}),
    ...Object.values(document.portalAccounts ?? {}),
  ]
  const emails = new Set<string>()
  for (const account of accounts) {
    const email = account?.email?.trim().toLowerCase()
    if (!email || emails.has(email)) throw new Error("Documento E2E contém e-mails ausentes ou duplicados")
    emails.add(email)
    if (account.role === "superadmin" ? account.companyLegacyId !== null : account.companyLegacyId !== configuredCompanyLegacyId) {
      throw new Error(`Conta E2E ${email} aponta para tenant diferente do configurado`)
    }
  }
  const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  if (!configuredSupabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente")
  const expectedUrl = new URL(configuredSupabaseUrl)
  const supabaseUrl = new URL(document.supabaseUrl)
  const expectedProjectRef = process.env.SUPABASE_PROJECT_REF?.trim() ?? expectedUrl.hostname.split(".")[0]
  if (
    supabaseUrl.origin !== expectedUrl.origin ||
    supabaseUrl.hostname !== expectedUrl.hostname ||
    document.supabaseProjectRef !== expectedProjectRef
  ) {
    throw new Error("supabaseUrl/supabaseProjectRef do documento E2E não correspondem ao ambiente configurado")
  }
  document.accounts.member.role = "member"
  document.portalAccounts ??= buildPortalAccounts(document.accounts.member.password, document.companyLegacyId)
  return document
}
