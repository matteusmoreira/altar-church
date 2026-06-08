"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { attachFileToEntity, getOptionalFile, uploadManagedFile } from "@/lib/files/server"

type FileActionResult = {
  ok: boolean
  id?: string
  originalName?: string
  error?: string
}

const uploadTargetSchema = z.enum(["church-logo", "church-cover", "content-cover", "banner-image"])

const targetConfig = {
  "church-logo": {
    entityTable: "church_profiles",
    purpose: "logo",
    permission: "settings.edit" as const,
    paths: ["/church-info", "/dashboard"],
  },
  "church-cover": {
    entityTable: "church_profiles",
    purpose: "cover",
    permission: "settings.edit" as const,
    paths: ["/church-info", "/dashboard"],
  },
  "content-cover": {
    entityTable: "content_posts",
    purpose: "cover",
    permission: "content.create" as const,
    paths: ["/content", "/dashboard"],
  },
  "banner-image": {
    entityTable: "banners",
    purpose: "image",
    permission: "content.create" as const,
    paths: ["/content", "/dashboard"],
  },
}

function formText(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function toErrorResult(error: unknown): FileActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message }
  }
  return { ok: false, error: "Erro inesperado" }
}

async function resolveCompanyId(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const inputCompanyId = formText(formData, "companyId")
  const companyId = requireUserCompanyId(user, inputCompanyId)
  return { user, companyId }
}

async function ensureChurchProfile(companyId: string, ownerProfileId: string, inputProfileId?: string | null) {
  const sql = getSql()
  if (inputProfileId) {
    const rows = await sql<{ id: string }[]>`
      select id
      from public.church_profiles
      where id = ${inputProfileId}
        and company_id = ${companyId}
      limit 1
    `
    if (rows[0]?.id) return rows[0].id
  }

  const rows = await sql<{ id: string }[]>`
    insert into public.church_profiles (
      company_id,
      public_name,
      responsible_name,
      email,
      phone,
      address,
      city,
      state,
      created_by,
      updated_by
    )
    select
      id,
      name,
      responsible_name,
      email,
      phone,
      address,
      city,
      state,
      ${ownerProfileId},
      ${ownerProfileId}
    from public.companies
    where id = ${companyId}
    on conflict (company_id) do update
    set updated_by = excluded.updated_by,
        updated_at = now()
    returning id
  `

  const profileId = rows[0]?.id
  if (!profileId) {
    throw new Error("Perfil da igreja não encontrado")
  }
  return profileId
}

function revalidate(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path)
  }
}

export async function uploadEntityAsset(formData: FormData): Promise<FileActionResult> {
  try {
    const target = uploadTargetSchema.parse(formText(formData, "target"))
    const config = targetConfig[target]
    const { user, companyId } = await resolveCompanyId(formData)
    await requirePermission(config.permission, companyId)

    const file = getOptionalFile(formData, "file")
    if (!file) {
      throw new Error("Arquivo obrigatório")
    }

    let entityId = formText(formData, "entityId") || null
    if (target === "church-logo" || target === "church-cover") {
      entityId = await ensureChurchProfile(companyId, user.id, entityId)
    }

    const uploaded = await uploadManagedFile({
      file,
      companyId,
      ownerProfileId: user.id,
      entityTable: config.entityTable,
      entityId,
      purpose: config.purpose,
      metadata: { target },
    })

    if ((target === "church-logo" || target === "church-cover") && entityId) {
      const sql = getSql()
      const column = target === "church-logo" ? "logo_file_id" : "cover_file_id"
      await sql`
        update public.church_profiles
        set ${sql(column)} = ${uploaded.id},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${entityId}
          and company_id = ${companyId}
      `
    }

    if (entityId && (target === "content-cover" || target === "banner-image")) {
      await attachFileToEntity({
        fileId: uploaded.id,
        companyId,
        entityTable: config.entityTable,
        entityId,
        ownerProfileId: user.id,
      })
    }

    await writeAuditLog({
      action: "app_file.upload",
      entityTable: "app_files",
      entityId: uploaded.id,
      companyId,
      metadata: {
        target,
        storagePath: uploaded.storagePath,
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      },
    })

    revalidate(config.paths)
    return { ok: true, id: uploaded.id, originalName: uploaded.originalName }
  } catch (error) {
    return toErrorResult(error)
  }
}
