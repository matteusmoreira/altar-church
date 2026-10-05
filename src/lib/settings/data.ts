import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { listApiKeys } from "@/lib/integrations/api-keys"
import { listDeliveries, listWebhookEndpoints } from "@/lib/integrations/webhooks"
import type { ApiKeyRow, DeliveryRow, WebhookEndpoint } from "@/lib/integrations/types"
import type { UserRole } from "@/lib/types"

export interface SettingsCompany {
  id: string
  name: string
  slug: string
  planName: string | null
  status: string
}

export interface SettingsProfile {
  id: string
  companyId: string | null
  companyName: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt: string
  cellIds: string[]
}

export interface SettingsData {
  actorId: string
  cells: { id: string; name: string; companyId: string }[]
  company: SettingsCompany | null
  profiles: SettingsProfile[]
  integrations: {
    webhooks: WebhookEndpoint[]
    apiKeys: ApiKeyRow[]
    deliveries: DeliveryRow[]
  } | null
}

interface CompanyRow {
  id: string
  name: string
  slug: string
  plan_name: string | null
  status: string
}

interface ProfileRow {
  id: string
  company_id: string | null
  company_name: string | null
  name: string
  email: string
  role: UserRole
  active: boolean
  created_at: Date | string
  cell_ids: string[]
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString()
  return value
}

async function resolveCompanyId() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return user.role === "superadmin" ? null : user.churchId ?? null
}

function toCompany(row: CompanyRow): SettingsCompany {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    planName: row.plan_name,
    status: row.status,
  }
}

function toProfile(row: ProfileRow): SettingsProfile {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    createdAt: toIso(row.created_at),
    cellIds: row.cell_ids ?? [],
  }
}

export async function getSettingsData(): Promise<SettingsData> {
  const companyId = await resolveCompanyId()
  const actor = await requirePermission("settings.manage_settings", companyId)

  const sql = getSql()
  const companyRows = companyId
    ? await sql<CompanyRow[]>`
        select c.id, c.name, c.slug, p.name as plan_name, c.status
        from public.companies c
        left join public.system_plans p on p.id = c.plan_id
        where c.id = ${companyId}
        limit 1
      `
    : []

  const profileRows = companyId
    ? await sql<ProfileRow[]>`
        select
          p.id,
          p.company_id,
          c.name as company_name,
          p.name,
          p.email,
          p.role,
          p.active,
          p.created_at,
          array(select g.id::text from public.groups g where g.company_id = p.company_id
            and g.leader_person_id = p.person_id and g.type = 'cell'
            and g.is_active = true and g.deleted_at is null) as cell_ids
        from public.profiles p
        left join public.companies c on c.id = p.company_id
        where p.company_id = ${companyId}
          and p.deleted_at is null
        order by p.created_at desc
      `
    : await sql<ProfileRow[]>`
        select
          p.id,
          p.company_id,
          c.name as company_name,
          p.name,
          p.email,
          p.role,
          p.active,
          p.created_at,
          array(select g.id::text from public.groups g where g.company_id = p.company_id
            and g.leader_person_id = p.person_id and g.type = 'cell'
            and g.is_active = true and g.deleted_at is null) as cell_ids
        from public.profiles p
        left join public.companies c on c.id = p.company_id
        where p.deleted_at is null
        order by p.created_at desc
        limit 200
      `

  let integrations: SettingsData["integrations"] = null
  if (companyId) {
    try {
      const [webhooks, apiKeys, deliveries] = await Promise.all([
        listWebhookEndpoints({ companyId, globalOnly: true }),
        listApiKeys(companyId),
        listDeliveries({ companyId, limit: 40 }),
      ])
      integrations = { webhooks, apiKeys, deliveries }
    } catch {
      integrations = { webhooks: [], apiKeys: [], deliveries: [] }
    }
  }

  return {
    actorId: actor.id,
    cells: companyId ? await sql<{ id: string; name: string; companyId: string }[]>`
      select id, name, company_id as "companyId" from public.groups
      where company_id = ${companyId} and type = 'cell' and is_active = true and deleted_at is null
      order by name
    ` : [],
    company: companyRows[0] ? toCompany(companyRows[0]) : null,
    profiles: profileRows.map(toProfile),
    integrations,
  }
}
