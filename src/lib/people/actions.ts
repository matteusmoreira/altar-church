"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import type { DuplicateCandidateActionInput, PeopleActionResult, SavePersonInput } from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => value || null)

const nullableTextSchema = z
  .union([z.string().trim(), z.null(), z.undefined()])
  .transform((value) => value || null)

const personSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  congregationId: nullableUuidSchema,
  firstName: z.string().trim().min(2, "Nome obrigatório"),
  lastName: z.string().trim().optional().default(""),
  fullName: z.string().trim().optional(),
  email: z
    .union([z.string().trim().email("E-mail inválido"), z.literal(""), z.null(), z.undefined()])
    .transform((value) => value || null),
  phone: z.string().trim().optional().default(""),
  document: nullableTextSchema,
  birthDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.literal(""), z.null(), z.undefined()])
    .transform((value) => value || null),
  gender: z.enum(["male", "female", "other", "not_informed"]).nullable().optional().default(null),
  address: z.string().trim().optional().default(""),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().max(2, "UF inválida").optional().default(""),
  country: z.string().trim().optional().default("Brasil"),
  accessProfile: nullableTextSchema,
  status: z.enum(["active", "inactive", "visitor"]).optional().default("active"),
  personType: z.enum(["visitor", "attendee", "member", "leader", "volunteer"]).optional().default("member"),
  journeyStatus: z.string().trim().optional().default(""),
  baptized: z.boolean().optional().default(false),
  emailValidated: z.boolean().optional().default(false),
  internalNotes: z.string().trim().optional().default(""),
  isActive: z.boolean().optional().default(true),
})

const deletePersonSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

const duplicateCandidateSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
  status: z.enum(["ignored", "merged"]),
})

function toErrorResult(error: unknown): PeopleActionResult {
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

async function refreshPeoplePaths() {
  revalidatePath("/pessoas")
  revalidatePath("/visitantes")
  revalidatePath("/dashboard")
}

async function refreshMemberCount(companyId: string) {
  const sql = getSql()
  await sql`
    update public.companies
    set member_count = counts.total
    from (
      select count(*)::integer as total
      from public.people
      where company_id = ${companyId}
        and deleted_at is null
        and is_active = true
        and status <> 'visitor'
    ) counts
    where id = ${companyId}
  `
}

export async function savePerson(input: SavePersonInput): Promise<PeopleActionResult> {
  try {
    const parsed = personSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)

    if (parsed.id) {
      await requirePermission("members.edit", companyId)
    } else {
      await requirePermission("members.create", companyId)
    }

    const fullName = parsed.fullName || [parsed.firstName, parsed.lastName].filter(Boolean).join(" ")
    const sql = getSql()
    let personId = parsed.id

    await sql.begin(async (tx) => {
      if (parsed.id) {
        const rows = await tx<{ id: string }[]>`
          update public.people
          set congregation_id = ${parsed.congregationId},
              first_name = ${parsed.firstName},
              last_name = ${parsed.lastName},
              full_name = ${fullName},
              email = ${parsed.email},
              phone = ${parsed.phone},
              document = ${parsed.document},
              birth_date = ${parsed.birthDate},
              gender = ${parsed.gender},
              address = ${parsed.address},
              city = ${parsed.city},
              state = ${parsed.state.toUpperCase()},
              country = ${parsed.country},
              access_profile = ${parsed.accessProfile},
              status = ${parsed.status},
              person_type = ${parsed.personType},
              journey_status = ${parsed.journeyStatus},
              baptized = ${parsed.baptized},
              email_validated = ${parsed.emailValidated},
              internal_notes = ${parsed.internalNotes},
              is_active = ${parsed.isActive},
              updated_by = ${user.id}
          where id = ${parsed.id}
            and company_id = ${companyId}
            and deleted_at is null
          returning id
        `
        personId = rows[0]?.id ?? null
      } else {
        const rows = await tx<{ id: string }[]>`
          insert into public.people (
            company_id,
            congregation_id,
            first_name,
            last_name,
            full_name,
            email,
            phone,
            document,
            birth_date,
            gender,
            address,
            city,
            state,
            country,
            access_profile,
            status,
            person_type,
            journey_status,
            baptized,
            email_validated,
            internal_notes,
            is_active,
            created_by,
            updated_by
          )
          values (
            ${companyId},
            ${parsed.congregationId},
            ${parsed.firstName},
            ${parsed.lastName},
            ${fullName},
            ${parsed.email},
            ${parsed.phone},
            ${parsed.document},
            ${parsed.birthDate},
            ${parsed.gender},
            ${parsed.address},
            ${parsed.city},
            ${parsed.state.toUpperCase()},
            ${parsed.country},
            ${parsed.accessProfile},
            ${parsed.status},
            ${parsed.personType},
            ${parsed.journeyStatus},
            ${parsed.baptized},
            ${parsed.emailValidated},
            ${parsed.internalNotes},
            ${parsed.isActive},
            ${user.id},
            ${user.id}
          )
          returning id
        `
        personId = rows[0]?.id ?? null
      }

      if (!personId) {
        throw new Error("Pessoa não foi salva")
      }
    })

    await refreshMemberCount(companyId)
    await writeAuditLog({
      action: "person.save",
      entityTable: "people",
      entityId: personId,
      companyId,
      metadata: {
        status: parsed.status,
        personType: parsed.personType,
        isActive: parsed.isActive,
      },
    })
    await refreshPeoplePaths()

    return { ok: true, id: personId ?? undefined }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deletePerson(input: { id: string; companyId?: string | null }): Promise<PeopleActionResult> {
  try {
    const parsed = deletePersonSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("members.delete", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.people
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id}
      where id = ${parsed.id}
        and company_id = ${companyId}
        and deleted_at is null
      returning id
    `

    const personId = rows[0]?.id
    if (!personId) {
      throw new Error("Pessoa não encontrada")
    }

    await refreshMemberCount(companyId)
    await writeAuditLog({
      action: "person.delete",
      entityTable: "people",
      entityId: personId,
      companyId,
      metadata: {},
    })
    await refreshPeoplePaths()

    return { ok: true, id: personId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function resolveDuplicateCandidate(input: DuplicateCandidateActionInput): Promise<PeopleActionResult> {
  try {
    const parsed = duplicateCandidateSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{
      id: string
      primary_person_id: string
      duplicate_person_id: string
      status: string
    }[]>`
      update public.duplicate_candidates
      set status = ${parsed.status},
          resolved_at = now(),
          updated_by = ${user.id},
          updated_at = now()
      where id = ${parsed.id}
        and company_id = ${companyId}
        and status = 'open'
      returning id, primary_person_id, duplicate_person_id, status
    `

    const candidate = rows[0]
    if (!candidate) {
      throw new Error("Duplicidade não encontrada")
    }

    await writeAuditLog({
      action: "person_duplicate.resolve",
      entityTable: "duplicate_candidates",
      entityId: candidate.id,
      companyId,
      metadata: {
        status: candidate.status,
        primaryPersonId: candidate.primary_person_id,
        duplicatePersonId: candidate.duplicate_person_id,
      },
    })
    await refreshPeoplePaths()

    return { ok: true, id: candidate.id }
  } catch (error) {
    return toErrorResult(error)
  }
}
