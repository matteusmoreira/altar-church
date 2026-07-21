"use server"

import { revalidatePath } from "next/cache"
import { withActionTiming } from "@/lib/performance/action-timing"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type {
  PastoralActionResult,
  SaveMinistryInput,
  SaveProgrammingInput,
  SaveSongInput,
} from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const ministrySchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  name: z.string().trim().min(2, "Nome obrigatorio"),
  description: z.string().trim().optional().default(""),
  contact: z.string().trim().optional().default(""),
  leaderPersonId: nullableUuidSchema,
  isActive: z.boolean().optional().default(true),
})

const programmingSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  title: z.string().trim().min(2, "Titulo obrigatorio"),
  description: z.string().trim().optional().default(""),
  date: z.string().trim().optional().default(""),
  durationMinutes: z.number().int().min(1).max(1440).optional().default(60),
  isRecurring: z.boolean().optional().default(false),
  isLive: z.boolean().optional().default(false),
  allowPublicChat: z.boolean().optional().default(false),
  sendPushNotification: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
})

const songSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  title: z.string().trim().min(2, "Titulo obrigatorio"),
  subtitle: z.string().trim().optional().default(""),
  code: z.string().trim().optional().default(""),
  author: z.string().trim().optional().default(""),
  theme: z.string().trim().optional().default(""),
  group: z.string().trim().optional().default(""),
  tone: z.string().trim().optional().default(""),
  rhythm: z.string().trim().optional().default(""),
  content: z.string().trim().optional().default(""),
  isActive: z.boolean().optional().default(true),
})

const deleteSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

function toErrorResult(error: unknown): PastoralActionResult {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? "Dados invalidos" }
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

function startsAtFromDate(date: string) {
  return date ? `${date}T00:00:00-03:00` : null
}

function refreshMinistryPaths() {
  revalidatePath("/ministerios")
  revalidatePath("/informacoes")
  revalidatePath("/dashboard")
}

function refreshProgrammingPaths() {
  revalidatePath("/programacao")
  revalidatePath("/informacoes")
  revalidatePath("/dashboard")
}

function refreshSongPaths() {
  revalidatePath("/louvor")
  revalidatePath("/informacoes")
  revalidatePath("/dashboard")
}

export async function saveMinistry(input: SaveMinistryInput): Promise<PastoralActionResult> {
  return withActionTiming("ministries.save", async () => {
    try {
    const parsed = ministrySchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission(parsed.id ? "ministries.edit" : "ministries.create", companyId)

    const sql = getSql()
    let ministryId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.ministries
        set name = ${parsed.name},
            description = ${parsed.description},
            contact = ${parsed.contact},
            leader_person_id = ${parsed.leaderPersonId},
            is_active = ${parsed.isActive},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      ministryId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.ministries (
          company_id,
          name,
          description,
          contact,
          leader_person_id,
          is_active,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.name},
          ${parsed.description},
          ${parsed.contact},
          ${parsed.leaderPersonId},
          ${parsed.isActive},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      ministryId = rows[0]?.id ?? null
    }

    if (!ministryId) {
      throw new Error("Ministerio nao foi salvo")
    }

    await writeAuditLog({
      action: "ministry.save",
      entityTable: "ministries",
      entityId: ministryId,
      companyId,
      metadata: { isActive: parsed.isActive },
    })
    refreshMinistryPaths()

    return { ok: true, id: ministryId }
    } catch (error) {
      return toErrorResult(error)
    }
  })
}

export async function deleteMinistry(input: { id: string; companyId?: string | null }): Promise<PastoralActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("ministries.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.ministries
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const ministryId = rows[0]?.id
    if (!ministryId) {
      throw new Error("Ministerio nao encontrado")
    }

    await writeAuditLog({
      action: "ministry.delete",
      entityTable: "ministries",
      entityId: ministryId,
      companyId,
      metadata: {},
    })
    refreshMinistryPaths()

    return { ok: true, id: ministryId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveProgramming(input: SaveProgrammingInput): Promise<PastoralActionResult> {
  try {
    const parsed = programmingSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    let programmingId = parsed.id
    const startsAt = startsAtFromDate(parsed.date)

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.programmings
        set title = ${parsed.title},
            description = ${parsed.description},
            starts_at = ${startsAt},
            duration_minutes = ${parsed.durationMinutes},
            is_recurring = ${parsed.isRecurring},
            is_live = ${parsed.isLive},
            allow_public_chat = ${parsed.allowPublicChat},
            send_push_notification = ${parsed.sendPushNotification},
            is_active = ${parsed.isActive},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      programmingId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.programmings (
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
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.title},
          ${parsed.description},
          ${startsAt},
          ${parsed.durationMinutes},
          ${parsed.isRecurring},
          ${parsed.isLive},
          ${parsed.allowPublicChat},
          ${parsed.sendPushNotification},
          ${parsed.isActive},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      programmingId = rows[0]?.id ?? null
    }

    if (!programmingId) {
      throw new Error("Programacao nao foi salva")
    }

    await writeAuditLog({
      action: "programming.save",
      entityTable: "programmings",
      entityId: programmingId,
      companyId,
      metadata: { startsAt, isActive: parsed.isActive },
    })
    refreshProgrammingPaths()

    return { ok: true, id: programmingId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteProgramming(input: { id: string; companyId?: string | null }): Promise<PastoralActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.programmings
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const programmingId = rows[0]?.id
    if (!programmingId) {
      throw new Error("Programacao nao encontrada")
    }

    await writeAuditLog({
      action: "programming.delete",
      entityTable: "programmings",
      entityId: programmingId,
      companyId,
      metadata: {},
    })
    refreshProgrammingPaths()

    return { ok: true, id: programmingId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveSong(input: SaveSongInput): Promise<PastoralActionResult> {
  try {
    const parsed = songSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    let songId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.songs
        set title = ${parsed.title},
            subtitle = ${parsed.subtitle},
            code = ${parsed.code},
            author = ${parsed.author},
            theme = ${parsed.theme},
            song_group = ${parsed.group},
            tone = ${parsed.tone},
            rhythm = ${parsed.rhythm},
            content = ${parsed.content},
            is_active = ${parsed.isActive},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      songId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.songs (
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
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.title},
          ${parsed.subtitle},
          ${parsed.code},
          ${parsed.author},
          ${parsed.theme},
          ${parsed.group},
          ${parsed.tone},
          ${parsed.rhythm},
          ${parsed.content},
          ${parsed.isActive},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      songId = rows[0]?.id ?? null
    }

    if (!songId) {
      throw new Error("Musica nao foi salva")
    }

    await writeAuditLog({
      action: "song.save",
      entityTable: "songs",
      entityId: songId,
      companyId,
      metadata: { isActive: parsed.isActive },
    })
    refreshSongPaths()

    return { ok: true, id: songId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteSong(input: { id: string; companyId?: string | null }): Promise<PastoralActionResult> {
  try {
    const parsed = deleteSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("settings.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.songs
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const songId = rows[0]?.id
    if (!songId) {
      throw new Error("Musica nao encontrada")
    }

    await writeAuditLog({
      action: "song.delete",
      entityTable: "songs",
      entityId: songId,
      companyId,
      metadata: {},
    })
    refreshSongPaths()

    return { ok: true, id: songId }
  } catch (error) {
    return toErrorResult(error)
  }
}
