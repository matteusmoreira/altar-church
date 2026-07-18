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
  ownerProfileId?: string | null
  entityTable: string
  entityId?: string | null
  purpose: string
  visibility?: "private" | "public"
  metadata?: Record<string, unknown>
  allowedMimeTypes?: ReadonlySet<string>
  allowedExtensions?: ReadonlySet<string>
  maxSizeBytes?: number
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

export function assertManagedFile(
  file: File,
  policy?: { allowedMimeTypes?: ReadonlySet<string>; allowedExtensions?: ReadonlySet<string>; maxSizeBytes?: number },
) {
  const mimeTypes = policy?.allowedMimeTypes ?? allowedMimeTypes
  const extension = file.name.includes(".") ? `.${file.name.split(".").pop()?.toLowerCase()}` : ""
  if (!mimeTypes.has(file.type) || (policy?.allowedExtensions && !policy.allowedExtensions.has(extension))) {
    throw new Error("Tipo de arquivo inválido")
  }
  const maxSizeBytes = policy?.maxSizeBytes ?? MAX_UPLOAD_SIZE_BYTES
  if (file.size > maxSizeBytes) {
    throw new Error(`Arquivo deve ter até ${Math.floor(maxSizeBytes / 1024 / 1024)} MB`)
  }
}

async function getStorageClient() {
  return createSupabaseAdminClient() ?? (await createSupabaseServerClient())
}

export async function uploadManagedFile(input: ManagedFileUploadInput): Promise<ManagedFileUploadResult> {
  assertManagedFile(input.file, input)
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
    const ownerProfileId = input.ownerProfileId ?? null
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
        purpose,
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
        ${ownerProfileId},
        ${input.entityTable},
        ${input.entityId ?? null},
        ${input.purpose},
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

export async function deleteManagedFile(fileId: string, companyId: string) {
  const sql = getSql()
  const rows = await sql<{ bucket: string; storage_path: string }[]>`
    select bucket, storage_path
    from public.app_files
    where id = ${fileId}
      and company_id = ${companyId}
      and is_active = true
      and deleted_at is null
    limit 1
  `
  const file = rows[0]
  if (!file) return false

  const storage = await getStorageClient()
  const removed = await storage.storage.from(file.bucket).remove([file.storage_path])
  if (removed.error) throw new Error(removed.error.message)

  await sql`
    update public.app_files
    set is_active = false, deleted_at = now(), updated_at = now()
    where id = ${fileId} and company_id = ${companyId}
  `
  return true
}

export async function replacePersonPhoto(input: {
  personId: string
  companyId: string
  ownerProfileId?: string | null
  file: File
}) {
  const sql = getSql()
  const people = await sql<{ id: string; photo_file_id: string | null }[]>`
    select id, photo_file_id
    from public.people
    where id = ${input.personId}
      and company_id = ${input.companyId}
      and deleted_at is null
    limit 1
  `
  const person = people[0]
  if (!person) throw new Error("Pessoa não encontrada")

  const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"])
  const uploaded = await uploadManagedFile({
    file: input.file,
    companyId: input.companyId,
    ownerProfileId: input.ownerProfileId,
    entityTable: "people",
    entityId: input.personId,
    purpose: "photo",
    metadata: { target: "kids-person-photo" },
    allowedMimeTypes: imageTypes,
    allowedExtensions: new Set([".jpg", ".jpeg", ".png", ".webp"]),
    maxSizeBytes: 5 * 1024 * 1024,
  })

  try {
    await sql`
      update public.people
      set photo_file_id = ${uploaded.id}, updated_at = now()
      where id = ${input.personId} and company_id = ${input.companyId}
    `
  } catch (error) {
    await deleteManagedFile(uploaded.id, input.companyId).catch(() => undefined)
    throw error
  }

  if (person.photo_file_id && person.photo_file_id !== uploaded.id) {
    await deleteManagedFile(person.photo_file_id, input.companyId)
  }
  return uploaded
}

export async function removePersonPhoto(personId: string, companyId: string) {
  const sql = getSql()
  const rows = await sql<{ photo_file_id: string | null }[]>`
    select photo_file_id from public.people
    where id = ${personId} and company_id = ${companyId} and deleted_at is null
    limit 1
  `
  const oldFileId = rows[0]?.photo_file_id ?? null
  if (!rows[0]) throw new Error("Pessoa não encontrada")
  await sql`
    update public.people
    set photo_file_id = null, updated_at = now()
    where id = ${personId}
      and company_id = ${companyId}
      and deleted_at is null
  `
  if (oldFileId) await deleteManagedFile(oldFileId, companyId)
  return oldFileId
}
