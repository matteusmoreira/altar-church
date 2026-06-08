import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type {
  ChurchInfoCongregation,
  ChurchInfoData,
  ChurchInfoMinistry,
  ChurchInfoProgramming,
  ChurchInfoSong,
  ChurchProfileData,
  SocialLinkItem,
} from "./types"

interface ProfileRow {
  id: string | null
  company_id: string
  company_name: string
  company_responsible_name: string
  company_email: string
  company_phone: string
  company_address: string
  company_city: string
  company_state: string
  public_name: string | null
  responsible_name: string | null
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  timezone: string | null
  history: string | null
  logo_file_id: string | null
  logo_original_name: string | null
  cover_file_id: string | null
  cover_original_name: string | null
}

interface SocialLinkRow {
  id: string
  platform: string
  url: string
  sort_order: number
  is_active: boolean
}

interface MinistryRow {
  id: string
  name: string
  leader_name: string | null
  member_count: string | number
  is_active: boolean
}

interface ProgrammingRow {
  id: string
  title: string
  starts_at: Date | string | null
  is_live: boolean
  is_active: boolean
}

interface SongRow {
  id: string
  title: string
  author: string
  theme: string
  tone: string
  is_active: boolean
}

interface CongregationRow {
  id: string
  name: string
  responsible: string
  address: string
  is_active: boolean
}

const defaultPlatforms = ["Instagram", "Facebook", "YouTube", "Twitter/X"]

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

function toIso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function toProfile(row: ProfileRow): ChurchProfileData {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    publicName: row.public_name || row.company_name,
    responsibleName: row.responsible_name || row.company_responsible_name,
    email: row.email || row.company_email,
    phone: row.phone || row.company_phone,
    website: row.website ?? "",
    address: row.address || row.company_address,
    city: row.city || row.company_city,
    state: row.state || row.company_state,
    country: row.country || "Brasil",
    timezone: row.timezone || "America/Sao_Paulo",
    history: row.history ?? "",
    logoFileId: row.logo_file_id,
    logoFileName: row.logo_original_name ?? "",
    coverFileId: row.cover_file_id,
    coverFileName: row.cover_original_name ?? "",
  }
}

function toSocialLink(row: SocialLinkRow): SocialLinkItem {
  return {
    id: row.id,
    platform: row.platform,
    url: row.url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

function defaultSocialLinks(existing: SocialLinkItem[]) {
  const links = [...existing]
  for (const platform of defaultPlatforms) {
    if (!links.some((link) => link.platform === platform)) {
      links.push({
        id: null,
        platform,
        url: "",
        sortOrder: links.length,
        isActive: true,
      })
    }
  }
  return links.sort((first, second) => first.sortOrder - second.sortOrder)
}

function toMinistry(row: MinistryRow): ChurchInfoMinistry {
  return {
    id: row.id,
    name: row.name,
    leaderName: row.leader_name ?? "",
    memberCount: toNumber(row.member_count),
    isActive: row.is_active,
  }
}

function toProgramming(row: ProgrammingRow): ChurchInfoProgramming {
  return {
    id: row.id,
    title: row.title,
    startsAt: toIso(row.starts_at),
    isLive: row.is_live,
    isActive: row.is_active,
  }
}

function toSong(row: SongRow): ChurchInfoSong {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    theme: row.theme,
    tone: row.tone,
    isActive: row.is_active,
  }
}

function toCongregation(row: CongregationRow): ChurchInfoCongregation {
  return {
    id: row.id,
    name: row.name,
    responsible: row.responsible,
    address: row.address,
    isActive: row.is_active,
  }
}

export async function getChurchInfoData(companyIdInput?: string | null): Promise<ChurchInfoData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("settings.edit", companyId)

  const sql = getSql()
  const [profileRows, socialLinkRows, ministryRows, programmingRows, songRows, congregationRows] = await Promise.all([
    sql<ProfileRow[]>`
      select
        cp.id,
        c.id as company_id,
        c.name as company_name,
        c.responsible_name as company_responsible_name,
        c.email as company_email,
        c.phone as company_phone,
        c.address as company_address,
        c.city as company_city,
        c.state as company_state,
        cp.public_name,
        cp.responsible_name,
        cp.email,
        cp.phone,
        cp.website,
        cp.address,
        cp.city,
        cp.state,
        cp.country,
        cp.timezone,
        cp.history,
        cp.logo_file_id,
        logo.original_name as logo_original_name,
        cp.cover_file_id,
        cover.original_name as cover_original_name
      from public.church_profiles cp
      right join public.companies c on cp.company_id = c.id
      left join public.app_files logo on logo.id = cp.logo_file_id
      left join public.app_files cover on cover.id = cp.cover_file_id
      where c.id = ${companyId}
      limit 1
    `,
    sql<SocialLinkRow[]>`
      select id, platform, url, sort_order, is_active
      from public.social_links
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order, platform
    `,
    sql<MinistryRow[]>`
      select
        m.id,
        m.name,
        p.full_name as leader_name,
        0 as member_count,
        m.is_active
      from public.ministries m
      left join public.people p on p.id = m.leader_person_id
      where m.company_id = ${companyId}
        and m.deleted_at is null
      order by m.created_at desc
      limit 50
    `,
    sql<ProgrammingRow[]>`
      select id, title, starts_at, is_live, is_active
      from public.programmings
      where company_id = ${companyId}
        and deleted_at is null
      order by starts_at desc nulls last, created_at desc
      limit 50
    `,
    sql<SongRow[]>`
      select id, title, author, theme, tone, is_active
      from public.songs
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 50
    `,
    sql<CongregationRow[]>`
      select id, name, responsible, address, is_active
      from public.congregations
      where company_id = ${companyId}
        and deleted_at is null
      order by created_at desc
      limit 50
    `,
  ])

  const profileRow = profileRows[0]
  if (!profileRow) {
    throw new Error("Igreja não encontrada")
  }

  return {
    profile: toProfile(profileRow),
    socialLinks: defaultSocialLinks(socialLinkRows.map(toSocialLink)),
    ministries: ministryRows.map(toMinistry),
    programmings: programmingRows.map(toProgramming),
    songs: songRows.map(toSong),
    congregations: congregationRows.map(toCongregation),
  }
}
