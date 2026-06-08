import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type {
  CongregationListFilters,
  CongregationListItem,
  CongregationsListResult,
} from "./types"

interface CongregationRow {
  id: string
  company_id: string
  name: string
  responsible: string
  address: string
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface CountRow {
  total: string | number
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString()
  return value
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function clampPage(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value ?? fallback), min), max)
}

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

function toCongregation(row: CongregationRow): CongregationListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    responsible: row.responsible,
    address: row.address,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function listCongregations(
  filters: CongregationListFilters = {},
): Promise<CongregationsListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requirePermission("members.view", companyId)

  const sql = getSql()
  const page = clampPage(filters.page, 1, 1, 100000)
  const pageSize = clampPage(filters.pageSize, 10, 1, 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const isActive = filters.isActive ?? null

  const [congregationRows, countRows] = await Promise.all([
    sql<CongregationRow[]>`
      select
        id,
        company_id,
        name,
        responsible,
        address,
        is_active,
        created_at,
        updated_at
      from public.congregations
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or name ilike ${searchPattern} or responsible ilike ${searchPattern} or address ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
      order by created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<CountRow[]>`
      select count(*) as total
      from public.congregations
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or name ilike ${searchPattern} or responsible ilike ${searchPattern} or address ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    congregations: congregationRows.map(toCongregation),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}
