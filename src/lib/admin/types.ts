import type { UserRole } from "@/lib/types"

export type BillingCycle = "free" | "monthly" | "yearly" | "custom"
export type CompanyStatus = "active" | "blocked" | "test"

export interface AdminModule {
  id: string
  label: string
  description: string
  route: string
  menuGroup: string
  iconName: string
  requiredPermission: string | null
  active: boolean
  sortOrder: number
}

export interface AdminPlan {
  id: string
  code: string
  name: string
  description: string
  price: number
  billingCycle: BillingCycle
  active: boolean
  sortOrder: number
  uazapiInstanceLimit: number
  moduleIds: string[]
}

export interface AdminCompany {
  id: string
  legacyId: string | null
  name: string
  slug: string
  responsibleName: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  planId: string | null
  planCode: string | null
  planName: string | null
  status: CompanyStatus
  active: boolean
  memberCount: number
  userCount: number
  moduleIds: string[]
}

export interface AdminProfile {
  id: string
  legacyId: string | null
  companyId: string | null
  companyName: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
}

export interface AdminDashboardData {
  companies: AdminCompany[]
  users: AdminProfile[]
  plans: AdminPlan[]
  modules: AdminModule[]
}

export interface ActionResult {
  ok: boolean
  error?: string
  resetLink?: string
  warning?: string
}
