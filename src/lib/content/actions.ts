"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { attachFileToEntity } from "@/lib/files/server"
import type { ContentActionResult, SaveContentBannerInput, SaveContentPostInput } from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const nullableDateTimeSchema = z
  .union([z.string().trim(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const contentPostSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  categoryId: nullableUuidSchema,
  type: z.enum(["news", "devotional", "ebd", "publication"]),
  title: z.string().trim().min(3, "Título obrigatório"),
  slug: z.string().trim().optional().default(""),
  summary: z.string().trim().max(500, "Resumo deve ter até 500 caracteres").optional().default(""),
  content: z.string().trim().min(10, "Conteúdo obrigatório"),
  authorName: z.string().trim().optional().default(""),
  embedUrl: z.string().trim().optional().default(""),
  coverFileId: nullableUuidSchema,
  coverImageUrl: z.string().trim().optional().default(""),
  status: z.enum(["draft", "published", "archived"]),
  scheduledPublishAt: nullableDateTimeSchema,
  publishedAt: nullableDateTimeSchema,
  sendPushNotification: z.boolean().optional().default(false),
})

const contentBannerSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  title: z.string().trim().min(3, "Título obrigatório"),
  imageFileId: nullableUuidSchema,
  imageUrl: z.string().trim().optional().default(""),
  linkUrl: z.string().trim().optional().default(""),
  sortOrder: z.number().int().min(0).optional().default(0),
  startsAt: nullableDateTimeSchema,
  endsAt: nullableDateTimeSchema,
  isActive: z.boolean().optional().default(true),
  showInApps: z.boolean().optional().default(true),
  showInWeb: z.boolean().optional().default(true),
})

const deleteSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function toErrorResult(error: unknown): ContentActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

async function resolveActionCompanyId(inputCompanyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const companyId = requireUserCompanyId(user, inputCompanyId)
  return { user, companyId }
}

async function revalidateContent(companySlug?: string | null) {
  revalidatePath("/conteudo")
  revalidatePath("/dashboard")
  if (companySlug) {
    revalidatePath(`/church/${companySlug}`)
  }
}

async function getCompanySlug(companyId: string) {
  const sql = getSql()
  const rows = await sql<{ slug: string }[]>`
    select slug
    from public.companies
    where id = ${companyId}
    limit 1
  `
  return rows[0]?.slug ?? null
}

export async function saveContentPost(input: SaveContentPostInput): Promise<ContentActionResult> {
  try {
    const parsed = contentPostSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    if (parsed.id) {
      await requirePermission("content.edit", companyId)
    } else {
      await requirePermission("content.create", companyId)
    }
    if (parsed.status === "published") {
      await requirePermission("content.publish", companyId)
    }

    const sql = getSql()
    const slug = slugify(parsed.slug || parsed.title)
    const publishedAt = parsed.status === "published" ? parsed.publishedAt || new Date().toISOString() : parsed.publishedAt
    let contentId = parsed.id

    if (parsed.categoryId) {
      const categoryRows = await sql<{ id: string }[]>`
        select id
        from public.content_categories
        where id = ${parsed.categoryId}
          and company_id = ${companyId}
          and deleted_at is null
        limit 1
      `
      if (!categoryRows[0]) {
        throw new Error("Categoria inválida")
      }
    }

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.content_posts
        set category_id = ${parsed.categoryId},
            type = ${parsed.type},
            title = ${parsed.title},
            slug = ${slug},
            summary = ${parsed.summary},
            content = ${parsed.content},
            author_name = ${parsed.authorName},
            embed_url = ${parsed.embedUrl},
            cover_file_id = ${parsed.coverFileId},
            cover_image_url = ${parsed.coverImageUrl},
            status = ${parsed.status},
            scheduled_publish_at = ${parsed.scheduledPublishAt},
            published_at = ${publishedAt},
            send_push_notification = ${parsed.sendPushNotification},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      contentId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.content_posts (
          company_id,
          category_id,
          type,
          title,
          slug,
          summary,
          content,
          author_name,
          embed_url,
          cover_file_id,
          cover_image_url,
          status,
          scheduled_publish_at,
          published_at,
          send_push_notification,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.categoryId},
          ${parsed.type},
          ${parsed.title},
          ${slug},
          ${parsed.summary},
          ${parsed.content},
          ${parsed.authorName},
          ${parsed.embedUrl},
          ${parsed.coverFileId},
          ${parsed.coverImageUrl},
          ${parsed.status},
          ${parsed.scheduledPublishAt},
          ${publishedAt},
          ${parsed.sendPushNotification},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      contentId = rows[0]?.id ?? null
    }

    if (!contentId) {
      throw new Error("Conteúdo não foi salvo")
    }

    if (parsed.coverFileId) {
      await attachFileToEntity({
        fileId: parsed.coverFileId,
        companyId,
        entityTable: "content_posts",
        entityId: contentId,
        ownerProfileId: user.id,
      })
    }

    await writeAuditLog({
      action: "content_post.save",
      entityTable: "content_posts",
      entityId: contentId,
      companyId,
      metadata: {
        type: parsed.type,
        status: parsed.status,
        sendPushNotification: parsed.sendPushNotification,
      },
    })
    await revalidateContent(await getCompanySlug(companyId))

    return { ok: true, id: contentId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteContentPost(input: { id: string; companyId?: string | null }): Promise<ContentActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("content.delete", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.content_posts
      set deleted_at = now(),
          updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const contentId = rows[0]?.id
    if (!contentId) {
      throw new Error("Conteúdo não encontrado")
    }

    await writeAuditLog({
      action: "content_post.delete",
      entityTable: "content_posts",
      entityId: contentId,
      companyId,
      metadata: {},
    })
    await revalidateContent(await getCompanySlug(companyId))

    return { ok: true, id: contentId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveContentBanner(input: SaveContentBannerInput): Promise<ContentActionResult> {
  try {
    const parsed = contentBannerSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    if (parsed.id) {
      await requirePermission("content.edit", companyId)
    } else {
      await requirePermission("content.create", companyId)
    }

    const sql = getSql()
    let bannerId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.banners
        set title = ${parsed.title},
            image_file_id = ${parsed.imageFileId},
            image_url = ${parsed.imageUrl},
            link_url = ${parsed.linkUrl},
            sort_order = ${parsed.sortOrder},
            starts_at = ${parsed.startsAt},
            ends_at = ${parsed.endsAt},
            is_active = ${parsed.isActive},
            show_in_apps = ${parsed.showInApps},
            show_in_web = ${parsed.showInWeb},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      bannerId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.banners (
          company_id,
          title,
          image_file_id,
          image_url,
          link_url,
          sort_order,
          starts_at,
          ends_at,
          is_active,
          show_in_apps,
          show_in_web,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.title},
          ${parsed.imageFileId},
          ${parsed.imageUrl},
          ${parsed.linkUrl},
          ${parsed.sortOrder},
          ${parsed.startsAt},
          ${parsed.endsAt},
          ${parsed.isActive},
          ${parsed.showInApps},
          ${parsed.showInWeb},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      bannerId = rows[0]?.id ?? null
    }

    if (!bannerId) {
      throw new Error("Banner não foi salvo")
    }

    if (parsed.imageFileId) {
      await attachFileToEntity({
        fileId: parsed.imageFileId,
        companyId,
        entityTable: "banners",
        entityId: bannerId,
        ownerProfileId: user.id,
      })
    }

    await writeAuditLog({
      action: "banner.save",
      entityTable: "banners",
      entityId: bannerId,
      companyId,
      metadata: {
        isActive: parsed.isActive,
        showInWeb: parsed.showInWeb,
      },
    })
    await revalidateContent(await getCompanySlug(companyId))

    return { ok: true, id: bannerId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteContentBanner(input: { id: string; companyId?: string | null }): Promise<ContentActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("content.delete", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.banners
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const bannerId = rows[0]?.id
    if (!bannerId) {
      throw new Error("Banner não encontrado")
    }

    await writeAuditLog({
      action: "banner.delete",
      entityTable: "banners",
      entityId: bannerId,
      companyId,
      metadata: {},
    })
    await revalidateContent(await getCompanySlug(companyId))

    return { ok: true, id: bannerId }
  } catch (error) {
    return toErrorResult(error)
  }
}
