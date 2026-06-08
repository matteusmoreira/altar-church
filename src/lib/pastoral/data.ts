import { requireCompanyAccess, requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type {
  MinistriesListResult,
  MinistryListItem,
  PastoralListFilters,
  ProgrammingListItem,
  ProgrammingsListResult,
  SongListItem,
  SongsListResult,
} from "./types"

interface CountRow {
  total: string | number
}

interface MinistryRow {
  id: string
  company_id: string
  name: string
  description: string
  contact: string
  leader_name: string | null
  member_count: string | number
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface ProgrammingRow {
  id: string
  company_id: string
  title: string
  description: string
  starts_at: Date | string | null
  duration_minutes: number
  is_recurring: boolean
  is_live: boolean
  allow_public_chat: boolean
  send_push_notification: boolean
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface SongRow {
  id: string
  company_id: string
  title: string
  subtitle: string
  code: string
  author: string
  theme: string
  song_group: string
  tone: string
  rhythm: string
  content: string
  is_active: boolean
  created_at: Date | string
  updated_at: Date | string
}

function toIso(value: Date | string) {
  if (value instanceof Date) return value.toISOString()
  return value
}

function toDateInput(value: Date | string | null) {
  if (!value) return ""
  return toIso(value).slice(0, 10)
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

function toMinistry(row: MinistryRow): MinistryListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    description: row.description,
    contact: row.contact,
    leaderName: row.leader_name ?? row.contact,
    memberCount: toNumber(row.member_count),
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toProgramming(row: ProgrammingRow): ProgrammingListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    date: toDateInput(row.starts_at),
    durationMinutes: row.duration_minutes,
    isRecurring: row.is_recurring,
    isLive: row.is_live,
    allowPublicChat: row.allow_public_chat,
    sendPushNotification: row.send_push_notification,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function toSong(row: SongRow): SongListItem {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    subtitle: row.subtitle,
    code: row.code,
    author: row.author,
    theme: row.theme,
    group: row.song_group,
    tone: row.tone,
    rhythm: row.rhythm,
    content: row.content,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function listMinistries(filters: PastoralListFilters = {}): Promise<MinistriesListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requirePermission("ministries.view", companyId)

  const sql = getSql()
  const page = clampPage(filters.page, 1, 1, 100000)
  const pageSize = clampPage(filters.pageSize, 10, 1, 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const isActive = filters.isActive ?? null

  const [rows, countRows] = await Promise.all([
    sql<MinistryRow[]>`
      select
        m.id,
        m.company_id,
        m.name,
        m.description,
        m.contact,
        p.full_name as leader_name,
        0 as member_count,
        m.is_active,
        m.created_at,
        m.updated_at
      from public.ministries m
      left join public.people p on p.id = m.leader_person_id
      where m.company_id = ${companyId}
        and m.deleted_at is null
        and (${search} = '' or m.name ilike ${searchPattern} or m.description ilike ${searchPattern} or m.contact ilike ${searchPattern} or coalesce(p.full_name, '') ilike ${searchPattern})
        and (${isActive}::boolean is null or m.is_active = ${isActive})
      order by m.created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<CountRow[]>`
      select count(*) as total
      from public.ministries m
      left join public.people p on p.id = m.leader_person_id
      where m.company_id = ${companyId}
        and m.deleted_at is null
        and (${search} = '' or m.name ilike ${searchPattern} or m.description ilike ${searchPattern} or m.contact ilike ${searchPattern} or coalesce(p.full_name, '') ilike ${searchPattern})
        and (${isActive}::boolean is null or m.is_active = ${isActive})
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    items: rows.map(toMinistry),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function listProgrammings(filters: PastoralListFilters = {}): Promise<ProgrammingsListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requireCompanyAccess(companyId)

  const sql = getSql()
  const page = clampPage(filters.page, 1, 1, 100000)
  const pageSize = clampPage(filters.pageSize, 10, 1, 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const isActive = filters.isActive ?? null

  const [rows, countRows] = await Promise.all([
    sql<ProgrammingRow[]>`
      select
        id,
        company_id,
        title,
        description,
        starts_at,
        duration_minutes,
        is_recurring,
        is_live,
        allow_public_chat,
        send_push_notification,
        is_active,
        created_at,
        updated_at
      from public.programmings
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or title ilike ${searchPattern} or description ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
      order by starts_at desc nulls last, created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<CountRow[]>`
      select count(*) as total
      from public.programmings
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or title ilike ${searchPattern} or description ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    items: rows.map(toProgramming),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

export async function listSongs(filters: PastoralListFilters = {}): Promise<SongsListResult> {
  const companyId = await resolveCompanyId(filters.companyId)
  await requireCompanyAccess(companyId)

  const sql = getSql()
  const page = clampPage(filters.page, 1, 1, 100000)
  const pageSize = clampPage(filters.pageSize, 10, 1, 100)
  const offset = (page - 1) * pageSize
  const search = filters.search?.trim() ?? ""
  const searchPattern = `%${search}%`
  const isActive = filters.isActive ?? null

  const [rows, countRows] = await Promise.all([
    sql<SongRow[]>`
      select
        id,
        company_id,
        title,
        subtitle,
        code,
        author,
        theme,
        song_group,
        tone,
        rhythm,
        content,
        is_active,
        created_at,
        updated_at
      from public.songs
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or title ilike ${searchPattern} or subtitle ilike ${searchPattern} or author ilike ${searchPattern} or theme ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
      order by created_at desc
      limit ${pageSize}
      offset ${offset}
    `,
    sql<CountRow[]>`
      select count(*) as total
      from public.songs
      where company_id = ${companyId}
        and deleted_at is null
        and (${search} = '' or title ilike ${searchPattern} or subtitle ilike ${searchPattern} or author ilike ${searchPattern} or theme ilike ${searchPattern})
        and (${isActive}::boolean is null or is_active = ${isActive})
    `,
  ])

  const total = toNumber(countRows[0]?.total)
  return {
    items: rows.map(toSong),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}
