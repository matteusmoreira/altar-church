import { randomUUID } from "node:crypto"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server"

export const FILE_BUCKET = "church-assets"
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
])

type ManagedFileUploadInput = {
  file: File
  companyId: string
  ownerProfileId: string
  entityTable: string
  entityId?: string | null
  purpose: string
  visibility?: "private" | "public"
  metadata?: Record<string, unknown>
}

type AttachFileInput = {
  fileId: string
  companyId: string
  entityTable: string
  entityId: string
  ownerProfileId: string
}

export type ManagedFileUploadResult = {
  id: string
  bucket: string
  storagePath: string
  originalName: string
  mimeType: string
  sizeBytes: number
}

function normalizeFileName(name: string) {
  const fallback = "arquivo"
  const [baseName, ...extensionParts] = name.split(".")
  const extension = extensionParts.length > 0 ? `.${extensionParts.pop()?.toLowerCase()}` : ""
  const safeBase =
    (baseName || fallback)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback

  return `${safeBase}${extension.replace(/[^a-z0-9.]/g, "")}`
}

function assertStorageSegment(value: string, label: string) {
  if (!/^[a-z0-9_.-]+$/.test(value)) {
    throw new Error(`${label} inválido`)
  }
}

export function getOptionalFile(formData: FormData, key: string) {
  const value = formData.get(key)
  if (!(value instanceof File) || value.size === 0) {
    return null
  }
  return value
}

export function assertManagedFile(file: File) {
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error("Tipo de arquivo inválido")
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Arquivo deve ter até 10 MB")
  }
}

async function getStorageClient() {
  return createSupabaseAdminClient() ?? (await createSupabaseServerClient())
}

export async function uploadManagedFile(input: ManagedFileUploadInput): Promise<ManagedFileUploadResult> {
  assertManagedFile(input.file)
  assertStorageSegment(input.entityTable, "Tabela")
  assertStorageSegment(input.purpose, "Finalidade")

  const originalName = input.file.name || "arquivo"
  const safeName = normalizeFileName(originalName)
  const entitySegment = input.entityId ?? "pending"
  const storagePath = `${input.companyId}/${input.entityTable}/${entitySegment}/${input.purpose}/${randomUUID()}-${safeName}`
  const storage = await getStorageClient()

  const uploadResult = await storage.storage.from(FILE_BUCKET).upload(storagePath, input.file, {
    contentType: input.file.type,
    cacheControl: "3600",
    upsert: false,
  })

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message)
  }

  try {
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.app_files (
        company_id,
        bucket,
        storage_path,
        original_name,
        mime_type,
        size_bytes,
        visibility,
        owner_profile_id,
        entity_table,
        entity_id,
        metadata
      )
      values (
        ${input.companyId},
        ${FILE_BUCKET},
        ${storagePath},
        ${originalName},
        ${input.file.type},
        ${input.file.size},
        ${input.visibility ?? "private"},
        ${input.ownerProfileId},
        ${input.entityTable},
        ${input.entityId ?? null},
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      returning id
    `

    const id = rows[0]?.id
    if (!id) {
      throw new Error("Arquivo não foi registrado")
    }

    return {
      id,
      bucket: FILE_BUCKET,
      storagePath,
      originalName,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
    }
  } catch (error) {
    await storage.storage.from(FILE_BUCKET).remove([storagePath])
    throw error
  }
}

export async function attachFileToEntity(input: AttachFileInput) {
  const rows = await getSql()<ManagedFileUploadResult[]>`
    update public.app_files
    set entity_table = ${input.entityTable},
        entity_id = ${input.entityId},
        owner_profile_id = coalesce(owner_profile_id, ${input.ownerProfileId}),
        updated_at = now()
    where id = ${input.fileId}
      and company_id = ${input.companyId}
      and bucket = ${FILE_BUCKET}
      and is_active = true
      and deleted_at is null
    returning id, bucket, storage_path as "storagePath", original_name as "originalName", mime_type as "mimeType", size_bytes as "sizeBytes"
  `

  if (!rows[0]) {
    throw new Error("Arquivo inválido")
  }

  return rows[0]
}

export async function createSignedUrlsByStoragePath(paths: string[], expiresInSeconds = 3600) {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  const urls = new Map<string, string>()
  if (uniquePaths.length === 0) {
    return urls
  }

  const storage = await getStorageClient()
  const results = await Promise.all(
    uniquePaths.map(async (path) => {
      const { data } = await storage.storage.from(FILE_BUCKET).createSignedUrl(path, expiresInSeconds)
      return [path, data?.signedUrl ?? ""] as const
    })
  )

  for (const [path, signedUrl] of results) {
    if (signedUrl) {
      urls.set(path, signedUrl)
    }
  }

  return urls
}
