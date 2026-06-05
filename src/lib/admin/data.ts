import { getSql } from "@/lib/db/client"
import type {
  AdminCompany,
  AdminDashboardData,
  AdminModule,
  AdminPlan,
  AdminProfile,
  BillingCycle,
  CompanyStatus,
} from "./types"
import type { UserRole } from "@/lib/types"

interface ModuleRow {
  id: string
  label: string
  description: string
  route: string
  menu_group: string
  icon_name: string
  required_permission: string | null
  active: boolean
  sort_order: number
}

interface PlanRow {
  id: string
  code: string
  name: string
  description: string
  price: string
  billing_cycle: BillingCycle
  active: boolean
  sort_order: number
}

interface PlanModuleRow {
  plan_id: string
  module_id: string
}

interface CompanyRow {
  id: string
  legacy_id: string | null
  name: string
  slug: string
  responsible_name: string
  address: string
  city: string
  state: string
  phone: string
  email: string
  plan_id: string | null
  plan_code: string | null
  plan_name: string | null
  status: CompanyStatus
  active: boolean
  member_count: number
  user_count: number
}

interface CompanyModuleRow {
  company_id: string
  module_id: string
}

interface ProfileRow {
  id: string
  legacy_id: string | null
  company_id: string | null
  company_name: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  created_at: Date
}

function groupModuleIds<T extends { module_id: string } & Record<string, string>>(
  rows: T[],
  ownerKey: keyof T
) {
  const moduleMap = new Map<string, string[]>()
  for (const row of rows) {
    const ownerId = row[ownerKey]
    const current = moduleMap.get(ownerId) ?? []
    current.push(row.module_id)
    moduleMap.set(ownerId, current)
  }
  return moduleMap
}

function toModule(row: ModuleRow): AdminModule {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    route: row.route,
    menuGroup: row.menu_group,
    iconName: row.icon_name,
    requiredPermission: row.required_permission,
    active: row.active,
    sortOrder: row.sort_order,
  }
}

export async function getAdminModules(): Promise<AdminModule[]> {
  const sql = getSql()
  const rows = await sql<ModuleRow[]>`
    select id, label, description, route, menu_group, icon_name, required_permission, active, sort_order
    from public.system_modules
    order by sort_order, label
  `

  return rows.map(toModule)
}

export async function getAdminPlans(): Promise<AdminPlan[]> {
  const sql = getSql()
  const [plans, planModules] = await Promise.all([
    sql<PlanRow[]>`
      select id, code, name, description, price::text, billing_cycle, active, sort_order
      from public.system_plans
      order by sort_order, name
    `,
    sql<(PlanModuleRow & Record<string, string>)[]>`
      select plan_id, module_id
      from public.plan_modules
      where included = true
      order by module_id
    `,
  ])
  const moduleMap = groupModuleIds(planModules, "plan_id")

  return plans.map((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    price: Number(plan.price),
    billingCycle: plan.billing_cycle,
    active: plan.active,
    sortOrder: plan.sort_order,
    moduleIds: moduleMap.get(plan.id) ?? [],
  }))
}

export async function getAdminCompanies(): Promise<AdminCompany[]> {
  const sql = getSql()
  const [companies, companyModules] = await Promise.all([
    sql<CompanyRow[]>`
      select
        c.id,
        c.legacy_id,
        c.name,
        c.slug,
        c.responsible_name,
        c.address,
        c.city,
        c.state,
        c.phone,
        c.email,
        c.plan_id,
        p.code as plan_code,
        p.name as plan_name,
        c.status,
        c.active,
        c.member_count,
        c.user_count
      from public.companies c
      left join public.system_plans p on p.id = c.plan_id
      order by c.created_at desc
    `,
    sql<(CompanyModuleRow & Record<string, string>)[]>`
      select company_id, module_id
      from public.company_enabled_modules
      order by sort_order
    `,
  ])
  const moduleMap = groupModuleIds(companyModules, "company_id")

  return companies.map((company) => ({
    id: company.id,
    legacyId: company.legacy_id,
    name: company.name,
    slug: company.slug,
    responsibleName: company.responsible_name,
    address: company.address,
    city: company.city,
    state: company.state,
    phone: company.phone,
    email: company.email,
    planId: company.plan_id,
    planCode: company.plan_code,
    planName: company.plan_name,
    status: company.status,
    active: company.active,
    memberCount: company.member_count,
    userCount: company.user_count,
    moduleIds: moduleMap.get(company.id) ?? [],
  }))
}

export async function getAdminProfiles(): Promise<AdminProfile[]> {
  const sql = getSql()
  const rows = await sql<ProfileRow[]>`
    select
      p.id,
      p.legacy_id,
      p.company_id,
      c.name as company_name,
      p.name,
      p.email,
      p.role,
      p.active,
      p.created_at
    from public.profiles p
    left join public.companies c on c.id = p.company_id
    order by p.created_at desc
  `

  return rows.map((profile) => ({
    id: profile.id,
    legacyId: profile.legacy_id,
    companyId: profile.company_id,
    companyName: profile.company_name,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    active: profile.active,
    createdAt: profile.created_at.toISOString().slice(0, 10),
  }))
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [companies, users, plans, modules] = await Promise.all([
    getAdminCompanies(),
    getAdminProfiles(),
    getAdminPlans(),
    getAdminModules(),
  ])

  return { companies, users, plans, modules }
}

export async function getCompanyEnabledModuleIds(companyId: string): Promise<string[]> {
  const sql = getSql()
  const rows = await sql<{ module_id: string }[]>`
    select module_id
    from public.company_enabled_modules
    where company_id = ${companyId}
    order by sort_order
  `

  return rows.map((row) => row.module_id)
}
