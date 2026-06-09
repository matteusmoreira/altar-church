"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import type { GroupsActionResult, SaveGroupInput, SaveGroupMeetingInput, SaveGroupMemberInput } from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value || null)

const optionalNullableUuidSchema = nullableUuidSchema.optional().transform((value) => value ?? null)

const nullableIntSchema = z
  .union([z.number().int().min(0), z.null(), z.undefined()])
  .transform((value) => value ?? null)

const nullableTimeSchema = z
  .union([z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido"), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value || null)

const groupSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  categoryId: nullableUuidSchema,
  congregationId: nullableUuidSchema,
  name: z.string().trim().min(3, "Nome obrigatório"),
  description: z.string().trim().optional().default(""),
  type: z.enum(["cell", "ministry", "department", "class"]).optional().default("cell"),
  leaderPersonId: nullableUuidSchema,
  coLeaderPersonId: nullableUuidSchema,
  coordinatorPersonId: nullableUuidSchema,
  meetingDay: z.string().trim().optional().default(""),
  meetingTime: nullableTimeSchema,
  meetingLocation: z.string().trim().optional().default(""),
  neighborhood: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  maxCapacity: z.number().int().min(0).optional().default(0),
  minAge: nullableIntSchema,
  maxAge: nullableIntSchema,
  acceptsRequests: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
}).refine((value) => value.minAge === null || value.maxAge === null || value.minAge <= value.maxAge, {
  message: "Idade mínima não pode ser maior que a máxima",
  path: ["minAge"],
})

const deleteGroupSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

const dateStringSchema = z.string().trim().min(1, "Data obrigatória").transform((value, context) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    context.addIssue({ code: "custom", message: "Data inválida" })
    return z.NEVER
  }
  return parsed
})

const nullableDateStringSchema = z
  .union([z.string().trim(), z.literal(""), z.null(), z.undefined()])
  .transform((value, context) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      context.addIssue({ code: "custom", message: "Data inválida" })
      return z.NEVER
    }
    return parsed
  })

const optionalNullableDateStringSchema = nullableDateStringSchema.optional().transform((value) => value ?? null)

const groupMemberSchema = z.object({
  id: nullableUuidSchema.optional(),
  companyId: nullableUuidSchema.optional(),
  groupId: z.string().uuid("Grupo obrigatório"),
  personId: z.string().uuid("Pessoa obrigatória"),
  role: z.enum(["member", "leader", "co_leader", "host", "visitor"]).optional().default("member"),
  status: z.enum(["active", "inactive", "pending"]).optional().default("active"),
  joinedAt: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de entrada inválida").optional(),
})

const removeGroupMemberSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema.optional(),
})

const groupMeetingSchema = z.object({
  id: nullableUuidSchema.optional(),
  companyId: nullableUuidSchema.optional(),
  groupId: z.string().uuid("Grupo obrigatório"),
  studyId: optionalNullableUuidSchema,
  title: z.string().trim().optional().default(""),
  startsAt: dateStringSchema,
  endsAt: optionalNullableDateStringSchema,
  location: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
  reportStatus: z.enum(["scheduled", "reported", "cancelled"]).optional().default("reported"),
  presentCount: z.number().int().min(0).optional().default(0),
  visitorCount: z.number().int().min(0).optional().default(0),
}).refine((value) => value.endsAt === null || value.endsAt >= value.startsAt, {
  message: "Fim não pode ser antes do início",
  path: ["endsAt"],
})

function toErrorResult(error: unknown): GroupsActionResult {
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

function refreshGroupsPaths() {
  revalidatePath("/gceus")
  revalidatePath("/celulas")
  revalidatePath("/dashboard")
  revalidatePath("/informacoes")
  revalidatePath("/presenca")
}

async function assertCompanyReference(table: "group_categories" | "congregations" | "people", id: string | null, companyId: string) {
  if (!id) return

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select id
    from public.${sql(table)}
    where id = ${id}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `

  if (!rows[0]) {
    throw new Error("Referência inválida para esta igreja")
  }
}

async function assertGroupReference(id: string, companyId: string) {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select id
    from public.groups
    where id = ${id}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `

  if (!rows[0]) {
    throw new Error("Grupo inválido para esta igreja")
  }
}

async function assertStudyReference(id: string | null, companyId: string) {
  if (!id) return

  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select id
    from public.group_studies
    where id = ${id}
      and company_id = ${companyId}
      and deleted_at is null
    limit 1
  `

  if (!rows[0]) {
    throw new Error("Estudo inválido para esta igreja")
  }
}

export async function saveGroup(input: SaveGroupInput): Promise<GroupsActionResult> {
  try {
    const parsed = groupSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)

    if (parsed.id) {
      await requirePermission("groups.edit", companyId)
    } else {
      await requirePermission("groups.create", companyId)
    }

    await Promise.all([
      assertCompanyReference("group_categories", parsed.categoryId, companyId),
      assertCompanyReference("congregations", parsed.congregationId, companyId),
      assertCompanyReference("people", parsed.leaderPersonId, companyId),
      assertCompanyReference("people", parsed.coLeaderPersonId, companyId),
      assertCompanyReference("people", parsed.coordinatorPersonId, companyId),
    ])

    const sql = getSql()
    let groupId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.groups
        set category_id = ${parsed.categoryId},
            congregation_id = ${parsed.congregationId},
            name = ${parsed.name},
            description = ${parsed.description},
            type = ${parsed.type},
            leader_person_id = ${parsed.leaderPersonId},
            co_leader_person_id = ${parsed.coLeaderPersonId},
            coordinator_person_id = ${parsed.coordinatorPersonId},
            meeting_day = ${parsed.meetingDay},
            meeting_time = ${parsed.meetingTime},
            meeting_location = ${parsed.meetingLocation},
            neighborhood = ${parsed.neighborhood},
            city = ${parsed.city},
            max_capacity = ${parsed.maxCapacity},
            min_age = ${parsed.minAge},
            max_age = ${parsed.maxAge},
            accepts_requests = ${parsed.acceptsRequests},
            is_active = ${parsed.isActive},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      groupId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.groups (
          company_id,
          category_id,
          congregation_id,
          name,
          description,
          type,
          leader_person_id,
          co_leader_person_id,
          coordinator_person_id,
          meeting_day,
          meeting_time,
          meeting_location,
          neighborhood,
          city,
          max_capacity,
          min_age,
          max_age,
          accepts_requests,
          is_active,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.categoryId},
          ${parsed.congregationId},
          ${parsed.name},
          ${parsed.description},
          ${parsed.type},
          ${parsed.leaderPersonId},
          ${parsed.coLeaderPersonId},
          ${parsed.coordinatorPersonId},
          ${parsed.meetingDay},
          ${parsed.meetingTime},
          ${parsed.meetingLocation},
          ${parsed.neighborhood},
          ${parsed.city},
          ${parsed.maxCapacity},
          ${parsed.minAge},
          ${parsed.maxAge},
          ${parsed.acceptsRequests},
          ${parsed.isActive},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      groupId = rows[0]?.id ?? null
    }

    if (!groupId) {
      throw new Error("Grupo não foi salvo")
    }

    await writeAuditLog({
      action: "group.save",
      entityTable: "groups",
      entityId: groupId,
      companyId,
      metadata: {
        type: parsed.type,
        isActive: parsed.isActive,
        acceptsRequests: parsed.acceptsRequests,
      },
    })
    refreshGroupsPaths()

    return { ok: true, id: groupId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteGroup(input: { id: string; companyId?: string | null }): Promise<GroupsActionResult> {
  try {
    const parsed = deleteGroupSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("groups.delete", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.groups
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const groupId = rows[0]?.id
    if (!groupId) {
      throw new Error("Grupo não encontrado")
    }

    await writeAuditLog({
      action: "group.delete",
      entityTable: "groups",
      entityId: groupId,
      companyId,
      metadata: {},
    })
    refreshGroupsPaths()

    return { ok: true, id: groupId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveGroupMember(input: SaveGroupMemberInput): Promise<GroupsActionResult> {
  try {
    const parsed = groupMemberSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("groups.edit", companyId)

    await Promise.all([
      assertGroupReference(parsed.groupId, companyId),
      assertCompanyReference("people", parsed.personId, companyId),
    ])

    const sql = getSql()
    const joinedAt = parsed.joinedAt ?? new Date().toISOString().slice(0, 10)
    const leftAt = parsed.status === "inactive" ? new Date().toISOString().slice(0, 10) : null
    let memberId = parsed.id

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.group_members
        set role = ${parsed.role},
            status = ${parsed.status},
            joined_at = ${joinedAt},
            left_at = ${leftAt},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
        returning id
      `
      memberId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.group_members (
          company_id,
          group_id,
          person_id,
          role,
          status,
          joined_at,
          left_at,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.groupId},
          ${parsed.personId},
          ${parsed.role},
          ${parsed.status},
          ${joinedAt},
          ${leftAt},
          ${user.id},
          ${user.id}
        )
        on conflict (group_id, person_id) do update
        set role = excluded.role,
            status = excluded.status,
            joined_at = excluded.joined_at,
            left_at = excluded.left_at,
            updated_by = excluded.updated_by
        returning id
      `
      memberId = rows[0]?.id ?? null
    }

    if (!memberId) {
      throw new Error("Participante não foi salvo")
    }

    await writeAuditLog({
      action: "group.member.save",
      entityTable: "group_members",
      entityId: memberId,
      companyId,
      metadata: {
        groupId: parsed.groupId,
        personId: parsed.personId,
        role: parsed.role,
        status: parsed.status,
      },
    })
    refreshGroupsPaths()

    return { ok: true, id: memberId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function removeGroupMember(input: { id: string; companyId?: string | null }): Promise<GroupsActionResult> {
  try {
    const parsed = removeGroupMemberSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("groups.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string; group_id: string; person_id: string }[]>`
      update public.group_members
      set status = 'inactive',
          left_at = current_date,
          updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
      returning id, group_id, person_id
    `

    const member = rows[0]
    if (!member) {
      throw new Error("Participante não encontrado")
    }

    await writeAuditLog({
      action: "group.member.remove",
      entityTable: "group_members",
      entityId: member.id,
      companyId,
      metadata: {
        groupId: member.group_id,
        personId: member.person_id,
      },
    })
    refreshGroupsPaths()

    return { ok: true, id: member.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveGroupMeeting(input: SaveGroupMeetingInput): Promise<GroupsActionResult> {
  try {
    const parsed = groupMeetingSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("groups.edit", companyId)

    await Promise.all([
      assertGroupReference(parsed.groupId, companyId),
      assertStudyReference(parsed.studyId, companyId),
    ])

    const sql = getSql()
    let meetingId = parsed.id
    const title = parsed.title || "Reunião de grupo"

    if (parsed.id) {
      const rows = await sql<{ id: string }[]>`
        update public.group_meetings
        set study_id = ${parsed.studyId},
            title = ${title},
            starts_at = ${parsed.startsAt},
            ends_at = ${parsed.endsAt},
            location = ${parsed.location},
            notes = ${parsed.notes},
            report_status = ${parsed.reportStatus},
            present_count = ${parsed.presentCount},
            visitor_count = ${parsed.visitorCount},
            updated_by = ${user.id}
        where id = ${parsed.id}
          and company_id = ${companyId}
          and deleted_at is null
        returning id
      `
      meetingId = rows[0]?.id ?? null
    } else {
      const rows = await sql<{ id: string }[]>`
        insert into public.group_meetings (
          company_id,
          group_id,
          study_id,
          title,
          starts_at,
          ends_at,
          location,
          notes,
          report_status,
          present_count,
          visitor_count,
          created_by,
          updated_by
        )
        values (
          ${companyId},
          ${parsed.groupId},
          ${parsed.studyId},
          ${title},
          ${parsed.startsAt},
          ${parsed.endsAt},
          ${parsed.location},
          ${parsed.notes},
          ${parsed.reportStatus},
          ${parsed.presentCount},
          ${parsed.visitorCount},
          ${user.id},
          ${user.id}
        )
        returning id
      `
      meetingId = rows[0]?.id ?? null
    }

    if (!meetingId) {
      throw new Error("Reunião não foi salva")
    }

    await writeAuditLog({
      action: "group.meeting.save",
      entityTable: "group_meetings",
      entityId: meetingId,
      companyId,
      metadata: {
        groupId: parsed.groupId,
        reportStatus: parsed.reportStatus,
        presentCount: parsed.presentCount,
        visitorCount: parsed.visitorCount,
      },
    })
    refreshGroupsPaths()

    return { ok: true, id: meetingId }
  } catch (error) {
    return toErrorResult(error)
  }
}
