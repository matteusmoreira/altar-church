"use server"

import { revalidatePath } from "next/cache"
import { afterResponse } from "@/lib/performance/after-response"
import { withActionTiming } from "@/lib/performance/action-timing"
import { z } from "zod"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission, writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { User } from "@/lib/types"
import type {
  BirthdayPerson,
  CreateMemberJourneyInput,
  CreatePersonActivityInput,
  DuplicateCandidateActionInput,
  InvitePersonAccessInput,
  PeopleActionResult,
  PersonAccessRole,
  SaveJourneyStepInput,
  SavePersonInput,
  UpdateMemberJourneyInput,
  UpdatePersonActivityInput,
} from "./types"

const nullableUuidSchema = z
  .union([z.string().uuid(), z.literal(""), z.null()])
  .optional()
  .transform((value) => value || null)

const nullableTextSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => value || null)

const postalCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .refine((value) => value === "" || /^\d{8}$/.test(value), "CEP inválido")

const accessRoleSchema = z.enum([
  "admin",
  "pastor",
  "ministry_leader",
  "cell_supervisor",
  "cell_leader",
  "communication",
  "finance",
  "volunteer",
  "member",
])

const personSchema = z.object({
  id: nullableUuidSchema,
  companyId: nullableUuidSchema,
  congregationId: nullableUuidSchema,
  firstName: z.string().trim().min(2, "Nome obrigatório"),
  lastName: z.string().trim().optional().default(""),
  fullName: z.string().trim().optional(),
  email: z
    .union([z.string().trim().email("E-mail inválido"), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
  phone: z.string().trim().optional().default(""),
  document: nullableTextSchema,
  birthDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.literal(""), z.null()])
    .optional()
    .transform((value) => value || null),
  gender: z.enum(["male", "female", "other", "not_informed"]).nullable().optional().default(null),
  address: z.string().trim().optional().default(""),
  postalCode: postalCodeSchema.optional().default(""),
  addressNumber: z.string().trim().max(40).optional().default(""),
  addressComplement: z.string().trim().max(120).optional().default(""),
  neighborhood: z.string().trim().optional().default(""),
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
  inviteAccess: z.boolean().optional().default(false),
  accessRole: accessRoleSchema.optional(),
  temporaryPassword: z.string().optional(),
  cellIds: z.array(z.string().uuid()).optional().default([]),
})

const invitePersonAccessSchema = z.object({
  personId: z.string().uuid(),
  companyId: nullableUuidSchema,
  role: accessRoleSchema,
  temporaryPassword: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
  cellIds: z.array(z.string().uuid()).optional().default([]),
})

const deletePersonSchema = z.object({
  id: z.string().uuid(),
  companyId: nullableUuidSchema,
})

const deletePeopleSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
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

function assertCanInviteAccess(user: User) {
  if (!["superadmin", "admin", "pastor"].includes(user.role)) {
    throw new Error("Apenas admin ou pastor podem convidar acesso ao sistema")
  }
}

async function resolveActionCompanyId(inputCompanyId?: string | null) {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error("Acesso negado")
  }

  const companyId = requireUserCompanyId(user, inputCompanyId)
  return { user, companyId }
}

async function refreshPeoplePaths(visitor = false) {
  if (visitor) revalidatePath("/visitantes")
  else revalidatePath("/pessoas")
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

async function refreshCompanyUserCount(companyId: string) {
  const sql = getSql()
  await sql`
    update public.companies c
    set user_count = counts.total
    from (
      select company_id, count(*)::integer as total
      from public.profiles
      where company_id is not null and active = true
      group by company_id
    ) counts
    where c.id = counts.company_id
      and c.id = ${companyId}
  `
}

async function validateCellLeaderCells(companyId: string, role: PersonAccessRole, cellIds: string[]) {
  if (role !== "cell_leader") return []
  const uniqueCellIds = [...new Set(cellIds)]
  if (uniqueCellIds.length === 0) {
    throw new Error("Selecione ao menos uma célula para o líder")
  }
  const rows = await getSql()<{ count: string | number }[]>`
    select count(*) as count
    from public.groups
    where company_id = ${companyId}
      and type = 'cell'
      and is_active = true
      and deleted_at is null
      and id = any(${uniqueCellIds}::uuid[])
  `
  if (Number(rows[0]?.count ?? 0) !== uniqueCellIds.length) {
    throw new Error("Uma ou mais células não pertencem a esta igreja")
  }
  return uniqueCellIds
}

async function syncCellLeaderAssignments(companyId: string, personId: string, cellIds: string[]) {
  await getSql()`
    select public.sync_cell_leader_assignments(${companyId}, ${personId}, ${cellIds}::uuid[])
  `
}

async function findAuthUserIdByEmail(email: string) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) return null

  const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (users.error) {
    throw new Error(`Consulta Auth falhou: ${users.error.message}`)
  }

  return users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())?.id ?? null
}

async function ensureAuthUserWithPassword(input: {
  email: string
  password: string
  name: string
  role: PersonAccessRole
  companyId: string
}) {
  const supabase = createSupabaseAdminClient()
  if (!supabase) {
    throw new Error("Convite indisponível: configure SUPABASE_SERVICE_ROLE_KEY no servidor")
  }

  const userMetadata = {
    name: input.name,
    role: input.role,
    company_id: input.companyId,
  }

  const created = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: userMetadata,
  })

  if (!created.error && created.data.user?.id) {
    return created.data.user.id
  }

  const message = created.error?.message ?? ""
  if (!/already|registered|exists/i.test(message)) {
    throw new Error(`Auth falhou: ${message || "não foi possível criar o usuário"}`)
  }

  const existingId = await findAuthUserIdByEmail(input.email)
  if (!existingId) {
    throw new Error("Usuário Auth já existe, mas não foi encontrado para vínculo")
  }

  const update = await supabase.auth.admin.updateUserById(existingId, {
    password: input.password,
    email_confirm: true,
    ban_duration: "none",
    user_metadata: userMetadata,
  })
  if (update.error) {
    throw new Error(`Atualização Auth falhou: ${update.error.message}`)
  }

  return existingId
}

async function provisionPersonAccess(input: {
  personId: string
  companyId: string
  role: PersonAccessRole
  temporaryPassword: string
  actorProfileId: string
}) {
  const sql = getSql()
  const people = await sql<{
    id: string
    company_id: string
    full_name: string
    email: string | null
    profile_id: string | null
    person_type: "visitor" | "attendee" | "member" | "leader" | "volunteer"
  }[]>`
    select id, company_id, full_name, email, profile_id, person_type
    from public.people
    where id = ${input.personId}
      and company_id = ${input.companyId}
      and deleted_at is null
    limit 1
  `

  const person = people[0]
  if (!person) {
    throw new Error("Pessoa não encontrada")
  }
  const effectiveRole: PersonAccessRole =
    person.person_type === "visitor" || person.person_type === "attendee"
      ? "member"
      : input.role

  const email = person.email?.trim().toLowerCase() ?? ""
  if (!email) {
    throw new Error("Informe um e-mail na pessoa antes de convidar o acesso")
  }

  const existingByEmail = await sql<{
    id: string
    company_id: string | null
    auth_user_id: string | null
    role: string
  }[]>`
    select id, company_id, auth_user_id, role
    from public.profiles
    where lower(email) = ${email}
    limit 1
  `

  const profileByEmail = existingByEmail[0]
  if (profileByEmail?.company_id && profileByEmail.company_id !== input.companyId) {
    throw new Error("Este e-mail já está vinculado a outra igreja")
  }

  const authUserId = await ensureAuthUserWithPassword({
    email,
    password: input.temporaryPassword,
    name: person.full_name,
    role: effectiveRole,
    companyId: input.companyId,
  })

  // Prefer profile matched by e-mail (unique) over a stale person.profile_id.
  let profileId = profileByEmail?.id ?? person.profile_id ?? null
  const wasReset = Boolean(profileId || person.profile_id)

  if (profileId) {
    await sql`
      update public.profiles
      set company_id = ${input.companyId},
          auth_user_id = coalesce(${authUserId}, auth_user_id),
          name = ${person.full_name},
          email = ${email},
          role = ${effectiveRole},
          person_id = ${person.id},
          active = true
      where id = ${profileId}
    `
  } else {
    const rows = await sql<{ id: string }[]>`
      insert into public.profiles (company_id, auth_user_id, person_id, name, email, role, active)
      values (${input.companyId}, ${authUserId}, ${person.id}, ${person.full_name}, ${email}, ${effectiveRole}, true)
      returning id
    `
    profileId = rows[0]?.id ?? null
  }

  if (!profileId) {
    throw new Error("Perfil de acesso não foi salvo")
  }

  // Ensure only one person points to this profile within the company.
  await sql`
    update public.people
    set profile_id = null,
        updated_by = ${input.actorProfileId}
    where company_id = ${input.companyId}
      and profile_id = ${profileId}
      and id <> ${person.id}
      and deleted_at is null
  `

  await sql`
    update public.people
    set profile_id = ${profileId},
        access_profile = ${effectiveRole},
        email_validated = true,
        updated_by = ${input.actorProfileId}
    where id = ${person.id}
      and company_id = ${input.companyId}
      and deleted_at is null
  `

  await refreshCompanyUserCount(input.companyId)
  await writeAuditLog({
    action: wasReset ? "person.reset_access" : "person.invite_access",
    entityTable: "people",
    entityId: person.id,
    companyId: input.companyId,
    metadata: {
      profileId,
      role: effectiveRole,
      email,
      authUserLinked: Boolean(authUserId),
    },
  })

  return {
    profileId,
    personId: person.id,
    wasReset,
    role: effectiveRole,
    previousRole: profileByEmail?.role ?? null,
  }
}

export async function savePerson(input: SavePersonInput): Promise<PeopleActionResult> {
  return withActionTiming("people.save", async () => {
    try {
    const parsed = personSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)

    if (parsed.id) {
      await requirePermission("members.edit", companyId)
    } else {
      await requirePermission("members.create", companyId)
    }

    if (parsed.inviteAccess) {
      assertCanInviteAccess(user)
      if (!parsed.email) {
        throw new Error("Informe um e-mail na pessoa antes de convidar o acesso")
      }
      if (!parsed.accessRole) {
        throw new Error("Selecione o perfil de acesso")
      }
      if (!parsed.temporaryPassword || parsed.temporaryPassword.length < 8) {
        throw new Error("Senha deve ter no mínimo 8 caracteres")
      }
      await validateCellLeaderCells(companyId, parsed.accessRole, parsed.cellIds)
    }

    const fullName = parsed.fullName || [parsed.firstName, parsed.lastName].filter(Boolean).join(" ")
    const sql = getSql()
    const auditMetadata = JSON.stringify({
      status: parsed.status,
      personType: parsed.personType,
      isActive: parsed.isActive,
      inviteAccess: Boolean(parsed.inviteAccess),
    })
    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          with saved as (
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
              postal_code = ${parsed.postalCode},
              address = ${parsed.address},
              address_number = ${parsed.addressNumber},
              address_complement = ${parsed.addressComplement},
              neighborhood = ${parsed.neighborhood},
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
          ), audited as (
            insert into public.audit_logs (company_id, actor_profile_id, action, entity_table, entity_id, metadata)
            select ${companyId}, ${user.id}, 'person.save', 'people', saved.id, ${auditMetadata}::jsonb
            from saved
            returning id
          )
          select saved.id from saved cross join audited
        `
      : await sql<{ id: string }[]>`
          with saved as (
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
            postal_code,
            address,
            address_number,
            address_complement,
            neighborhood,
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
            ${parsed.postalCode},
            ${parsed.address},
            ${parsed.addressNumber},
            ${parsed.addressComplement},
            ${parsed.neighborhood},
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
          ), audited as (
            insert into public.audit_logs (company_id, actor_profile_id, action, entity_table, entity_id, metadata)
            select ${companyId}, ${user.id}, 'person.save', 'people', saved.id, ${auditMetadata}::jsonb
            from saved
            returning id
          )
          select saved.id from saved cross join audited
        `
    const personId = rows[0]?.id ?? null
    if (!personId) throw new Error("Pessoa não foi salva")

    if (!parsed.id && personId) {
      try {
        await sql`
          insert into public.person_journey_enrollments (company_id, person_id, journey_id, status, started_at, created_by)
          select ${companyId}, ${personId}, id, 'in_progress', now(), ${user.id}
          from public.member_journeys
          where company_id = ${companyId}
            and deleted_at is null
            and is_active = true
            and is_auto_enroll = true
            and (
              auto_enroll_type = 'all'
              or (auto_enroll_type = 'visitor' and (${parsed.status} = 'visitor' or ${parsed.personType} = 'visitor'))
              or (auto_enroll_type = 'member' and (${parsed.personType} = 'member' or ${parsed.personType} = 'leader' or ${parsed.personType} = 'volunteer'))
            )
          on conflict (person_id, journey_id) do nothing
        `
      } catch (err) {
        console.error("Erro na auto-inscrição em jornada:", err)
      }
    }

    if (parsed.inviteAccess && personId && parsed.accessRole && parsed.temporaryPassword) {
      const provisioned = await provisionPersonAccess({
        personId,
        companyId,
        role: parsed.accessRole,
        temporaryPassword: parsed.temporaryPassword,
        actorProfileId: user.id,
      })
      if (provisioned.role === "cell_leader") {
        await syncCellLeaderAssignments(companyId, personId, parsed.cellIds)
      } else if (provisioned.previousRole === "cell_leader") {
        await syncCellLeaderAssignments(companyId, personId, [])
      }
    }

    afterResponse("people member count", () => refreshMemberCount(companyId))

    if (personId) {
      afterResponse("person integration event", async () => {
        try {
        const { enqueueIntegrationEventSafe } = await import("@/lib/integrations/enqueue")
        const eventType = parsed.id ? "person.updated" : "person.created"
        await enqueueIntegrationEventSafe({
          companyId,
          eventType,
          eventKey: `${eventType}:${personId}:${Date.now()}`,
          data: {
            person: {
              id: personId,
              name: fullName,
              email: parsed.email || null,
              phone: parsed.phone || null,
              status: parsed.status,
              personType: parsed.personType,
            },
          },
        })
          const { processIntegrationOutbox } = await import("@/lib/integrations/deliver")
          await processIntegrationOutbox(25)
        } catch (integrationError) {
          console.error("[integrations] person emit failed", integrationError)
        }
      })
    }

    await refreshPeoplePaths(parsed.status === "visitor" || parsed.personType === "visitor")

    return { ok: true, id: personId ?? undefined }
    } catch (error) {
      return toErrorResult(error)
    }
  })
}

export async function invitePersonAccess(input: InvitePersonAccessInput): Promise<PeopleActionResult> {
  try {
    const parsed = invitePersonAccessSchema.parse(input)
    const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
    assertCanInviteAccess(user)
    await requirePermission("members.edit", companyId)
    const cellIds = await validateCellLeaderCells(companyId, parsed.role, parsed.cellIds)

    const result = await provisionPersonAccess({
      personId: parsed.personId,
      companyId,
      role: parsed.role,
      temporaryPassword: parsed.temporaryPassword,
      actorProfileId: user.id,
    })
    if (result.role === "cell_leader") {
      await syncCellLeaderAssignments(companyId, result.personId, cellIds)
    } else if (result.previousRole === "cell_leader") {
      await syncCellLeaderAssignments(companyId, result.personId, [])
    }

    await refreshPeoplePaths()
    return { ok: true, id: result.personId }
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

export async function deletePeople(input: { ids: string[]; companyId?: string | null }): Promise<PeopleActionResult> {
  return withActionTiming("people.bulk_delete", async () => {
    try {
      const parsed = deletePeopleSchema.parse(input)
      const { user, companyId } = await resolveActionCompanyId(parsed.companyId)
      await requirePermission("members.delete", companyId)

      const ids = [...new Set(parsed.ids)]
      const rows = await getSql()<{ id: string }[]>`
        update public.people
        set deleted_at = now(), is_active = false, updated_by = ${user.id}
        where company_id = ${companyId}
          and id = any(${ids}::uuid[])
          and deleted_at is null
        returning id
      `
      if (rows.length === 0) throw new Error("Nenhuma pessoa encontrada")

      afterResponse("people member count", () => refreshMemberCount(companyId))
      await writeAuditLog({
        action: "person.bulk_delete",
        entityTable: "people",
        companyId,
        metadata: { ids: rows.map((row) => row.id), count: rows.length },
      })
      await refreshPeoplePaths()
      return { ok: true, id: rows[0]?.id }
    } catch (error) {
      return toErrorResult(error)
    }
  })
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

export async function createPersonActivity(input: CreatePersonActivityInput): Promise<PeopleActionResult> {
  try {
    const description = input.description.trim()
    if (!description) {
      return { ok: false, error: "Descrição da atividade é obrigatória" }
    }
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.person_activities (
        company_id,
        description,
        category,
        is_active,
        created_by,
        updated_by
      ) values (
        ${companyId},
        ${description},
        ${input.category},
        true,
        ${user.id},
        ${user.id}
      )
      returning id
    `
    await refreshPeoplePaths()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function updatePersonActivity(input: UpdatePersonActivityInput): Promise<PeopleActionResult> {
  try {
    const description = input.description.trim()
    if (!description) {
      return { ok: false, error: "Descrição da atividade é obrigatória" }
    }
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.person_activities
      set description = ${description},
          category = ${input.category},
          is_active = ${input.isActive !== undefined ? input.isActive : true},
          updated_by = ${user.id},
          updated_at = now()
      where id = ${input.id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]) return { ok: false, error: "Atividade não encontrada" }
    await refreshPeoplePaths()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deletePersonActivity(activityId: string, companyIdInput?: string | null): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    await sql`
      update public.person_activities
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${activityId} and company_id = ${companyId}
    `
    await refreshPeoplePaths()
    return { ok: true, id: activityId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function assignPersonActivity(input: {
  personId: string
  activityId: string
  companyId?: string | null
}): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.person_activity_assignments (
        company_id, person_id, activity_id, is_active, assigned_by, assigned_at
      ) values (
        ${companyId}, ${input.personId}, ${input.activityId}, true, ${user.id}, now()
      )
      on conflict (person_id, activity_id)
      do update set is_active = true, assigned_at = now(), updated_at = now()
      returning id
    `
    await refreshPeoplePaths()
    revalidatePath(`/pessoas/${input.personId}`)
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function removePersonActivity(assignmentId: string, companyIdInput?: string | null): Promise<PeopleActionResult> {
  try {
    const { companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ person_id: string }[]>`
      delete from public.person_activity_assignments
      where id = ${assignmentId} and company_id = ${companyId}
      returning person_id
    `
    await refreshPeoplePaths()
    if (rows[0]?.person_id) {
      revalidatePath(`/pessoas/${rows[0].person_id}`)
    }
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function togglePersonActivityAssignment(
  assignmentId: string,
  isActive: boolean,
  companyIdInput?: string | null,
): Promise<PeopleActionResult> {
  try {
    const { companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ person_id: string }[]>`
      update public.person_activity_assignments
      set is_active = ${isActive}, updated_at = now()
      where id = ${assignmentId} and company_id = ${companyId}
      returning person_id
    `
    await refreshPeoplePaths()
    if (rows[0]?.person_id) {
      revalidatePath(`/pessoas/${rows[0].person_id}`)
    }
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function createMemberJourney(input: CreateMemberJourneyInput): Promise<PeopleActionResult> {
  try {
    const name = input.name.trim()
    if (!name) {
      return { ok: false, error: "Nome da jornada é obrigatório" }
    }
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.member_journeys (
        company_id,
        name,
        description,
        is_active,
        is_auto_enroll,
        auto_enroll_type,
        created_by,
        updated_by
      ) values (
        ${companyId},
        ${name},
        ${input.description?.trim() || ""},
        true,
        ${Boolean(input.isAutoEnroll)},
        ${input.autoEnrollType || null},
        ${user.id},
        ${user.id}
      )
      returning id
    `
    await refreshPeoplePaths()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function updateMemberJourney(input: UpdateMemberJourneyInput): Promise<PeopleActionResult> {
  try {
    const name = input.name.trim()
    if (!name) {
      return { ok: false, error: "Nome da jornada é obrigatório" }
    }
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      update public.member_journeys
      set name = ${name},
          description = ${input.description?.trim() || ""},
          is_auto_enroll = ${input.isAutoEnroll !== undefined ? input.isAutoEnroll : false},
          auto_enroll_type = ${input.autoEnrollType || null},
          is_active = ${input.isActive !== undefined ? input.isActive : true},
          updated_by = ${user.id},
          updated_at = now()
      where id = ${input.id} and company_id = ${companyId} and deleted_at is null
      returning id
    `
    if (!rows[0]) return { ok: false, error: "Jornada não encontrada" }
    await refreshPeoplePaths()
    return { ok: true, id: rows[0].id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteMemberJourney(journeyId: string, companyIdInput?: string | null): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    await sql`
      update public.member_journeys
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${journeyId} and company_id = ${companyId}
    `
    await refreshPeoplePaths()
    return { ok: true, id: journeyId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function saveJourneyStep(input: SaveJourneyStepInput): Promise<PeopleActionResult> {
  try {
    const name = input.name.trim()
    if (!name) {
      return { ok: false, error: "Nome da etapa é obrigatório" }
    }
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    if (input.id) {
      const rows = await sql<{ id: string }[]>`
        update public.member_journey_steps
        set name = ${name},
            description = ${input.description?.trim() || ""},
            sort_order = ${typeof input.sortOrder === "number" ? input.sortOrder : 0},
            estimated_days = ${typeof input.estimatedDays === "number" && input.estimatedDays > 0 ? input.estimatedDays : 7},
            is_active = ${input.isActive !== undefined ? input.isActive : true},
            updated_by = ${user.id},
            updated_at = now()
        where id = ${input.id} and company_id = ${companyId} and deleted_at is null
        returning id
      `
      if (!rows[0]) return { ok: false, error: "Etapa não encontrada" }
      await refreshPeoplePaths()
      return { ok: true, id: rows[0].id }
    }

    // New step: determine sort_order if not provided
    let sortOrder = input.sortOrder
    if (typeof sortOrder !== "number") {
      const maxRows = await sql<{ max_order: number | null }[]>`
        select max(sort_order) as max_order
        from public.member_journey_steps
        where journey_id = ${input.journeyId} and company_id = ${companyId} and deleted_at is null
      `
      sortOrder = (maxRows[0]?.max_order ?? 0) + 1
    }

    const rows = await sql<{ id: string }[]>`
      insert into public.member_journey_steps (
        company_id,
        journey_id,
        name,
        description,
        sort_order,
        estimated_days,
        is_active,
        created_by,
        updated_by
      ) values (
        ${companyId},
        ${input.journeyId},
        ${name},
        ${input.description?.trim() || ""},
        ${sortOrder},
        ${typeof input.estimatedDays === "number" && input.estimatedDays > 0 ? input.estimatedDays : 7},
        true,
        ${user.id},
        ${user.id}
      )
      returning id
    `
    await refreshPeoplePaths()
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function deleteJourneyStep(stepId: string, companyIdInput?: string | null): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    await sql`
      update public.member_journey_steps
      set deleted_at = now(),
          is_active = false,
          updated_by = ${user.id},
          updated_at = now()
      where id = ${stepId} and company_id = ${companyId}
    `
    await refreshPeoplePaths()
    return { ok: true, id: stepId }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function reorderJourneySteps(
  journeyId: string,
  stepIds: string[],
  companyIdInput?: string | null,
): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    for (let i = 0; i < stepIds.length; i++) {
      await sql`
        update public.member_journey_steps
        set sort_order = ${i + 1}, updated_by = ${user.id}, updated_at = now()
        where id = ${stepIds[i]} and journey_id = ${journeyId} and company_id = ${companyId}
      `
    }
    await refreshPeoplePaths()
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function enrollPersonInJourney(input: {
  personId: string
  journeyId: string
  companyId?: string | null
}): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ id: string }[]>`
      insert into public.person_journey_enrollments (
        company_id, person_id, journey_id, status, started_at, created_by
      ) values (
        ${companyId}, ${input.personId}, ${input.journeyId}, 'in_progress', now(), ${user.id}
      )
      on conflict (person_id, journey_id)
      do update set status = 'in_progress', completed_at = null, updated_at = now()
      returning id
    `
    await refreshPeoplePaths()
    revalidatePath(`/pessoas/${input.personId}`)
    return { ok: true, id: rows[0]?.id }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function unenrollPersonFromJourney(
  enrollmentId: string,
  companyIdInput?: string | null,
): Promise<PeopleActionResult> {
  try {
    const { companyId } = await resolveActionCompanyId(companyIdInput)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    const rows = await sql<{ person_id: string }[]>`
      delete from public.person_journey_enrollments
      where id = ${enrollmentId} and company_id = ${companyId}
      returning person_id
    `
    await refreshPeoplePaths()
    if (rows[0]?.person_id) {
      revalidatePath(`/pessoas/${rows[0].person_id}`)
    }
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function toggleStepProgress(input: {
  personId: string
  journeyId: string
  stepId: string
  completed: boolean
  notes?: string
  completedAt?: string | null
  companyId?: string | null
}): Promise<PeopleActionResult> {
  try {
    const { user, companyId } = await resolveActionCompanyId(input.companyId)
    await requirePermission("members.edit", companyId)

    const sql = getSql()
    if (input.completed) {
      const completedAt = input.completedAt ? new Date(input.completedAt).toISOString() : new Date().toISOString()
      await sql`
        insert into public.person_journey_progress (
          company_id, person_id, journey_id, step_id, completed_at, completed_by, notes, updated_at
        ) values (
          ${companyId}, ${input.personId}, ${input.journeyId}, ${input.stepId},
          ${completedAt}, ${user.id}, ${input.notes?.trim() || ""}, now()
        )
        on conflict (person_id, journey_id, step_id)
        do update set completed_at = ${completedAt}, completed_by = ${user.id},
                      notes = ${input.notes?.trim() || ""}, updated_at = now()
      `

      // Make sure the person is enrolled in this journey
      await sql`
        insert into public.person_journey_enrollments (
          company_id, person_id, journey_id, status, started_at, created_by
        ) values (
          ${companyId}, ${input.personId}, ${input.journeyId}, 'in_progress', now(), ${user.id}
        )
        on conflict (person_id, journey_id) do nothing
      `

      // Check if all active steps in this journey are now completed
      const checkRows = await sql<{ total_steps: number; completed_steps: number }[]>`
        select
          count(mjs.id)::int as total_steps,
          count(pjp.completed_at)::int as completed_steps
        from public.member_journey_steps mjs
        left join public.person_journey_progress pjp
          on pjp.step_id = mjs.id
         and pjp.person_id = ${input.personId}
         and pjp.completed_at is not null
        where mjs.journey_id = ${input.journeyId}
          and mjs.company_id = ${companyId}
          and mjs.deleted_at is null
          and mjs.is_active = true
      `
      const counts = checkRows[0]
      if (counts && counts.total_steps > 0 && counts.completed_steps >= counts.total_steps) {
        await sql`
          update public.person_journey_enrollments
          set status = 'completed', completed_at = now(), updated_at = now()
          where person_id = ${input.personId} and journey_id = ${input.journeyId} and company_id = ${companyId}
        `
      }
    } else {
      await sql`
        update public.person_journey_progress
        set completed_at = null, updated_at = now()
        where person_id = ${input.personId} and journey_id = ${input.journeyId} and step_id = ${input.stepId}
          and company_id = ${companyId}
      `
      await sql`
        update public.person_journey_enrollments
        set status = 'in_progress', completed_at = null, updated_at = now()
        where person_id = ${input.personId} and journey_id = ${input.journeyId} and company_id = ${companyId}
      `
    }

    await refreshPeoplePaths()
    revalidatePath(`/pessoas/${input.personId}`)
    return { ok: true }
  } catch (error) {
    return toErrorResult(error)
  }
}

export async function loadBirthdayPeople(month?: number): Promise<BirthdayPerson[]> {
  const { listBirthdayPeople } = await import("./data")
  return listBirthdayPeople(month)
}

export async function convertVisitorToMember(personId: string): Promise<PeopleActionResult> {
  return withActionTiming("people.convertVisitorToMember", async () => {
    try {
      const { user, companyId } = await resolveActionCompanyId()
      await requirePermission("members.edit", companyId)
      const sql = getSql()

      await sql`
        update public.people
        set
          person_type = 'member',
          status = 'active',
          journey_status = 'converted',
          is_active = true,
          updated_at = now()
        where id = ${personId}
          and company_id = ${companyId}
          and deleted_at is null
      `

      await sql`
        update public.group_members
        set role = 'member', updated_at = now()
        where company_id = ${companyId}
          and person_id = ${personId}
          and role = 'visitor'
      `

      await refreshMemberCount(companyId)
      await refreshPeoplePaths(true)
      await refreshPeoplePaths(false)
      revalidatePath(`/pessoas/${personId}`)

      await writeAuditLog({
        action: "person.convert_to_member",
        entityTable: "people",
        companyId,
        metadata: { personId, convertedBy: user.id },
      })

      return { ok: true, id: personId }
    } catch (error) {
      return toErrorResult(error)
    }
  })
}

export async function assignVisitorToCell(input: {
  personId: string
  cellId: string | null
}): Promise<PeopleActionResult> {
  return withActionTiming("people.assignVisitorToCell", async () => {
    try {
      const { user, companyId } = await resolveActionCompanyId()
      await requirePermission("members.edit", companyId)
      const sql = getSql()

      if (!input.cellId) {
        await sql`
          update public.group_members
          set status = 'inactive', left_at = current_date, updated_at = now()
          where company_id = ${companyId}
            and person_id = ${input.personId}
            and group_id in (select id from public.groups where company_id = ${companyId} and type = 'cell')
        `
      } else {
        const cellExists = await sql<{ id: string }[]>`
          select id from public.groups
          where id = ${input.cellId} and company_id = ${companyId} and type = 'cell' and is_active = true and deleted_at is null
        `
        if (cellExists.length === 0) {
          return { ok: false, error: "Célula não encontrada ou inativa" }
        }

        await sql`
          update public.group_members
          set status = 'inactive', left_at = current_date, updated_at = now()
          where company_id = ${companyId}
            and person_id = ${input.personId}
            and group_id in (select id from public.groups where company_id = ${companyId} and type = 'cell' and id <> ${input.cellId})
        `

        await sql`
          insert into public.group_members (
            company_id,
            group_id,
            person_id,
            role,
            status,
            joined_at,
            created_by,
            updated_by
          )
          values (
            ${companyId},
            ${input.cellId},
            ${input.personId},
            'visitor',
            'active',
            current_date,
            ${user.id},
            ${user.id}
          )
          on conflict (group_id, person_id) do update
          set
            status = 'active',
            left_at = null,
            updated_by = excluded.updated_by,
            updated_at = now()
        `
      }

      await refreshPeoplePaths(true)
      await refreshPeoplePaths(false)
      revalidatePath(`/pessoas/${input.personId}`)
      revalidatePath("/celulas")

      await writeAuditLog({
        action: "person.assign_cell",
        entityTable: "group_members",
        companyId,
        metadata: { personId: input.personId, cellId: input.cellId, assignedBy: user.id },
      })

      return { ok: true, id: input.personId }
    } catch (error) {
      return toErrorResult(error)
    }
  })
}

