import { requirePermission } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import type {
  ContentBanner,
  ContentCategory,
  ContentDashboardData,
  ContentPost,
  ContentType,
  PublicChurchData,
} from "./types"

interface CategoryRow {
  id: string
  company_id: string
  name: string
  slug: string
  description: string
  content_type: ContentType | null
  sort_order: number
  is_active: boolean
}

interface PostRow {
  id: string
  company_id: string
  category_id: string | null
  category_name: string | null
  type: ContentType
  title: string
  slug: string
  summary: string
  content: string
  author_name: string
  embed_url: string
  cover_file_id: string | null
  cover_original_name: string | null
  cover_storage_path: string | null
  cover_image_url: string
  status: "draft" | "published" | "archived"
  scheduled_publish_at: Date | string | null
  published_at: Date | string | null
  send_push_notification: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface BannerRow {
  id: string
  company_id: string
  title: string
  image_file_id: string | null
  image_original_name: string | null
  image_storage_path: string | null
  image_url: string
  link_url: string
  sort_order: number
  starts_at: Date | string | null
  ends_at: Date | string | null
  is_active: boolean
  show_in_apps: boolean
  show_in_web: boolean
  created_at: Date | string
  updated_at: Date | string
}

interface PublicChurchRow {
  id: string
  slug: string
  name: string
  public_name: string | null
  email: string
  phone: string
  website: string | null
  address: string
  city: string
  state: string
  history: string | null
}

interface PublicMinistryRow {
  id: string
  name: string
  description: string
  leader_name: string | null
}

interface PublicProgrammingRow {
  id: string
  title: string
  description: string
  starts_at: Date | string | null
  is_live: boolean
}

interface PublicCongregationRow {
  id: string
  name: string
  responsible: string
  address: string
}

function toIso(value: Date | string | null) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return value
}

function toCategory(row: CategoryRow): ContentCategory {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    contentType: row.content_type,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

function toPost(row: PostRow, fileUrl?: string): ContentPost {
  return {
    id: row.id,
    companyId: row.company_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    type: row.type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: row.content,
    authorName: row.author_name,
    embedUrl: row.embed_url,
    coverFileId: row.cover_file_id,
    coverFileName: row.cover_original_name ?? "",
    coverImageUrl: fileUrl || row.cover_image_url,
    status: row.status,
    scheduledPublishAt: toIso(row.scheduled_publish_at),
    publishedAt: toIso(row.published_at),
    sendPushNotification: row.send_push_notification,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

function toBanner(row: BannerRow, fileUrl?: string): ContentBanner {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    imageFileId: row.image_file_id,
    imageFileName: row.image_original_name ?? "",
    imageUrl: fileUrl || row.image_url,
    linkUrl: row.link_url,
    sortOrder: row.sort_order,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    isActive: row.is_active,
    showInApps: row.show_in_apps,
    showInWeb: row.show_in_web,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  }
}

async function resolveCompanyId(companyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  return requireUserCompanyId(user, companyId)
}

export async function getContentDashboardData(companyIdInput?: string | null): Promise<ContentDashboardData> {
  const companyId = await resolveCompanyId(companyIdInput)
  await requirePermission("content.view", companyId)

  const sql = getSql()
  const [categoryRows, postRows, bannerRows] = await Promise.all([
    sql<CategoryRow[]>`
      select id, company_id, name, slug, description, content_type, sort_order, is_active
      from public.content_categories
      where company_id = ${companyId}
        and deleted_at is null
      order by sort_order, name
    `,
    sql<PostRow[]>`
      select
        p.id,
        p.company_id,
        p.category_id,
        c.name as category_name,
        p.type,
        p.title,
        p.slug,
        p.summary,
        p.content,
        p.author_name,
        p.embed_url,
        p.cover_file_id,
        cover.original_name as cover_original_name,
        cover.storage_path as cover_storage_path,
        p.cover_image_url,
        p.status,
        p.scheduled_publish_at,
        p.published_at,
        p.send_push_notification,
        p.created_at,
        p.updated_at
      from public.content_posts p
      left join public.content_categories c on c.id = p.category_id
      left join public.app_files cover on cover.id = p.cover_file_id
      where p.company_id = ${companyId}
        and p.deleted_at is null
      order by p.updated_at desc
      limit 200
    `,
    sql<BannerRow[]>`
      select
        b.id,
        b.company_id,
        b.title,
        b.image_file_id,
        image_file.original_name as image_original_name,
        image_file.storage_path as image_storage_path,
        b.image_url,
        b.link_url,
        b.sort_order,
        b.starts_at,
        b.ends_at,
        b.is_active,
        b.show_in_apps,
        b.show_in_web,
        b.created_at,
        b.updated_at
      from public.banners b
      left join public.app_files image_file on image_file.id = b.image_file_id
      where b.company_id = ${companyId}
        and b.deleted_at is null
      order by b.sort_order, b.created_at desc
      limit 100
    `,
  ])

  const fileUrls = await createSignedUrlsByStoragePath([
    ...postRows.map((post) => post.cover_storage_path ?? ""),
    ...bannerRows.map((banner) => banner.image_storage_path ?? ""),
  ])

  return {
    categories: categoryRows.map(toCategory),
    posts: postRows.map((post) => toPost(post, post.cover_storage_path ? fileUrls.get(post.cover_storage_path) : undefined)),
    banners: bannerRows.map((banner) => toBanner(banner, banner.image_storage_path ? fileUrls.get(banner.image_storage_path) : undefined)),
  }
}

export async function getPublicChurchData(slug: string): Promise<PublicChurchData | null> {
  const sql = getSql()
  const churchRows = await sql<PublicChurchRow[]>`
    select
      c.id,
      c.slug,
      c.name,
      cp.public_name,
      coalesce(cp.email, c.email) as email,
      coalesce(cp.phone, c.phone) as phone,
      cp.website,
      coalesce(cp.address, c.address) as address,
      coalesce(cp.city, c.city) as city,
      coalesce(cp.state, c.state) as state,
      cp.history
    from public.companies c
    left join public.church_profiles cp on cp.company_id = c.id
    where c.slug = ${slug}
      and c.active = true
      and c.status = 'active'
    limit 1
  `

  const church = churchRows[0]
  if (!church) {
    return null
  }

  const [bannerRows, postRows, ministryRows, programmingRows, congregationRows] = await Promise.all([
    sql<BannerRow[]>`
      select
        b.id,
        b.company_id,
        b.title,
        b.image_file_id,
        image_file.original_name as image_original_name,
        image_file.storage_path as image_storage_path,
        b.image_url,
        b.link_url,
        b.sort_order,
        b.starts_at,
        b.ends_at,
        b.is_active,
        b.show_in_apps,
        b.show_in_web,
        b.created_at,
        b.updated_at
      from public.banners b
      left join public.app_files image_file on image_file.id = b.image_file_id
      where b.company_id = ${church.id}
        and b.deleted_at is null
        and b.is_active = true
        and b.show_in_web = true
        and (b.starts_at is null or b.starts_at <= now())
        and (b.ends_at is null or b.ends_at >= now())
      order by b.sort_order, b.created_at desc
      limit 5
    `,
    sql<PostRow[]>`
      select
        p.id,
        p.company_id,
        p.category_id,
        c.name as category_name,
        p.type,
        p.title,
        p.slug,
        p.summary,
        p.content,
        p.author_name,
        p.embed_url,
        p.cover_file_id,
        cover.original_name as cover_original_name,
        cover.storage_path as cover_storage_path,
        p.cover_image_url,
        p.status,
        p.scheduled_publish_at,
        p.published_at,
        p.send_push_notification,
        p.created_at,
        p.updated_at
      from public.content_posts p
      left join public.content_categories c on c.id = p.category_id
      left join public.app_files cover on cover.id = p.cover_file_id
      where p.company_id = ${church.id}
        and p.deleted_at is null
        and p.status = 'published'
        and (p.published_at is null or p.published_at <= now())
      order by p.published_at desc nulls last, p.created_at desc
      limit 6
    `,
    sql<PublicMinistryRow[]>`
      select m.id, m.name, m.description, p.full_name as leader_name
      from public.ministries m
      left join public.people p on p.id = m.leader_person_id
      where m.company_id = ${church.id}
        and m.deleted_at is null
        and m.is_active = true
      order by m.created_at desc
      limit 6
    `,
    sql<PublicProgrammingRow[]>`
      select id, title, description, starts_at, is_live
      from public.programmings
      where company_id = ${church.id}
        and deleted_at is null
        and is_active = true
      order by starts_at asc nulls last, created_at desc
      limit 6
    `,
    sql<PublicCongregationRow[]>`
      select id, name, responsible, address
      from public.congregations
      where company_id = ${church.id}
        and deleted_at is null
        and is_active = true
      order by created_at desc
      limit 6
    `,
  ])

  const fileUrls = await createSignedUrlsByStoragePath([
    ...postRows.map((post) => post.cover_storage_path ?? ""),
    ...bannerRows.map((banner) => banner.image_storage_path ?? ""),
  ])

  return {
    church: {
      id: church.id,
      slug: church.slug,
      name: church.name,
      publicName: church.public_name || church.name,
      email: church.email,
      phone: church.phone,
      website: church.website ?? "",
      address: church.address,
      city: church.city,
      state: church.state,
      history: church.history ?? "",
    },
    banners: bannerRows.map((banner) => toBanner(banner, banner.image_storage_path ? fileUrls.get(banner.image_storage_path) : undefined)),
    posts: postRows.map((post) => toPost(post, post.cover_storage_path ? fileUrls.get(post.cover_storage_path) : undefined)),
    ministries: ministryRows.map((ministry) => ({
      id: ministry.id,
      name: ministry.name,
      description: ministry.description,
      leaderName: ministry.leader_name,
    })),
    programmings: programmingRows.map((programming) => ({
      id: programming.id,
      title: programming.title,
      description: programming.description,
      startsAt: toIso(programming.starts_at),
      isLive: programming.is_live,
    })),
    congregations: congregationRows.map((congregation) => ({
      id: congregation.id,
      name: congregation.name,
      responsible: congregation.responsible,
      address: congregation.address,
    })),
  }
}
