"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { deleteManagedFile, getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { createNotificationCampaignDeliveries, type NotificationAudience } from "@/lib/notifications/campaign"
import { rankVolunteersForShift, withManualSelectionRules, type SchedulerCandidateInput } from "@/lib/volunteers/scheduler"
import { requireMinistryPermission } from "./access"

export type ActionResult = { ok: boolean; id?: string; error?: string; data?: unknown }

const uuid = z.string().uuid()
const optionalUuid = z.union([uuid, z.literal(""), z.null()]).optional().transform((value) => value || null)

function result(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Dados inválidos" }
  return { ok: false, error: error instanceof Error ? error.message : "Erro inesperado" }
}

function refresh(ministryId: string) {
  revalidatePath(`/ministerios/${ministryId}`)
  revalidatePath("/ministerios")
  revalidatePath("/membro/ministerios")
}

const profileSchema = z.object({
  ministryId: uuid, companyId: optionalUuid, name: z.string().trim().min(2).max(120), ministryType: z.enum(["worship", "kids", "youth", "care", "discipleship", "outreach", "administration", "other"]), mission: z.string().trim().max(4000).default(""), description: z.string().trim().max(4000).default(""), targetAudience: z.string().trim().max(1000).default(""), contact: z.string().trim().max(300).default(""), leaderPersonId: optionalUuid, meetingDay: z.number().int().min(0).max(6).nullable().optional(), meetingTime: z.string().trim().max(20).nullable().optional(), meetingLocation: z.string().trim().max(300).default(""), imageFileId: optionalUuid, publicJoinEnabled: z.boolean().default(true), isActive: z.boolean().default(true),
})

export async function saveMinistryProfile(input: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const parsed = profileSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.dashboard.view", parsed.companyId, { manage: true })
    const sql = getSql()
    const isAdmin = ["superadmin", "admin", "pastor"].includes(access.user.role)
    if (isAdmin && parsed.leaderPersonId) {
      const leaderRows = await sql<{ id: string }[]>`
        select id from public.people
        where id = ${parsed.leaderPersonId} and company_id = ${access.companyId}
          and is_active and deleted_at is null limit 1
      `
      if (!leaderRows[0]) throw new Error("O responsável precisa ser uma pessoa ativa da igreja")
    }
    const rows = isAdmin
      ? await sql<{ id: string }[]>`
          update public.ministries set
            name = ${parsed.name}, ministry_type = ${parsed.ministryType}, mission = ${parsed.mission}, description = ${parsed.description},
            target_audience = ${parsed.targetAudience}, contact = ${parsed.contact}, meeting_day = ${parsed.meetingDay ?? null},
            meeting_time = ${parsed.meetingTime ?? null}::time, meeting_location = ${parsed.meetingLocation}, image_file_id = ${parsed.imageFileId},
            public_join_enabled = ${parsed.publicJoinEnabled}, is_active = ${parsed.isActive}, updated_by = ${access.user.id}, updated_at = now()
          where id = ${parsed.ministryId} and company_id = ${access.companyId} and deleted_at is null
          returning id
        `
      : await sql<{ id: string }[]>`
          update public.ministries set
            name = ${parsed.name}, ministry_type = ${parsed.ministryType}, mission = ${parsed.mission}, description = ${parsed.description},
            target_audience = ${parsed.targetAudience}, contact = ${parsed.contact}, meeting_day = ${parsed.meetingDay ?? null},
            meeting_time = ${parsed.meetingTime ?? null}::time, meeting_location = ${parsed.meetingLocation}, image_file_id = ${parsed.imageFileId},
            public_join_enabled = ${parsed.publicJoinEnabled}, updated_by = ${access.user.id}, updated_at = now()
          where id = ${parsed.ministryId} and company_id = ${access.companyId} and deleted_at is null
          returning id
        `
    if (!rows[0]) throw new Error("Ministério não encontrado")
    if (isAdmin) {
      await sql`
        update public.ministries set leader_person_id = ${parsed.leaderPersonId}, updated_by = ${access.user.id}, updated_at = now()
        where id = ${parsed.ministryId} and company_id = ${access.companyId}
      `
    }
    await writeAuditLog({ action: "ministry.profile.update", entityTable: "ministries", entityId: parsed.ministryId, companyId: access.companyId, metadata: { isAdmin } })
    refresh(parsed.ministryId)
    return { ok: true, id: parsed.ministryId }
  } catch (error) { return result(error) }
}

const membershipSchema = z.object({ membershipId: uuid, ministryId: uuid, companyId: optionalUuid, decision: z.enum(["approve", "reject", "reactivate", "remove"]) })

export async function reviewMinistryMember(input: z.input<typeof membershipSchema>): Promise<ActionResult> {
  try {
    const parsed = membershipSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.members.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const rows = await sql<{ id: string; status: string; person_id: string }[]>`
      select id, status, person_id from public.ministry_memberships
      where id = ${parsed.membershipId} and ministry_id = ${parsed.ministryId} and company_id = ${access.companyId} limit 1
    `
    const membership = rows[0]
    if (!membership) throw new Error("Vínculo não encontrado")
    if (parsed.decision === "approve" && membership.status === "active") return { ok: true, id: membership.id }
    if (parsed.decision === "approve" && !["pending", "rejected", "inactive"].includes(membership.status)) throw new Error("Transição inválida")
    if (parsed.decision === "reject" && membership.status !== "pending") throw new Error("Somente solicitações pendentes podem ser rejeitadas")
    if (parsed.decision === "reactivate" && membership.status !== "inactive") throw new Error("Somente vínculos inativos podem ser reativados")
    if (parsed.decision === "remove" && membership.status !== "active") throw new Error("Somente vínculos ativos podem sair")
    const nextStatus = parsed.decision === "approve" || parsed.decision === "reactivate" ? "active" : parsed.decision === "reject" ? "rejected" : "inactive"
    await sql`
      update public.ministry_memberships set status = ${nextStatus}, reviewed_by = ${access.user.id}, reviewed_at = now(),
        joined_at = case when ${nextStatus} = 'active' then coalesce(joined_at, now()) else joined_at end,
        left_at = case when ${nextStatus} = 'active' then null else coalesce(left_at, now()) end, updated_at = now()
      where id = ${membership.id} and company_id = ${access.companyId}
    `
    await writeAuditLog({ action: `ministry.membership.${parsed.decision}`, entityTable: "ministry_memberships", entityId: membership.id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, status: nextStatus, personId: membership.person_id } })
    refresh(parsed.ministryId)
    return { ok: true, id: membership.id }
  } catch (error) { return result(error) }
}

const addMemberSchema = z.object({ ministryId: uuid, companyId: optionalUuid, personId: uuid })

export async function addMinistryMember(input: z.input<typeof addMemberSchema>): Promise<ActionResult> {
  try {
    const parsed = addMemberSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.members.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const people = await sql<{ id: string }[]>`
      select id from public.people
      where id = ${parsed.personId} and company_id = ${access.companyId}
        and is_active and deleted_at is null
      limit 1
    `
    if (!people[0]) throw new Error("Pessoa não encontrada ou inativa")
    const rows = await sql<{ id: string }[]>`
      insert into public.ministry_memberships (
        company_id, ministry_id, person_id, role, status,
        requested_by, reviewed_by, requested_at, reviewed_at, joined_at, left_at
      ) values (
        ${access.companyId}, ${parsed.ministryId}, ${parsed.personId}, 'member', 'active',
        ${access.user.id}, ${access.user.id}, now(), now(), now(), null
      )
      on conflict (ministry_id, person_id) do update set
        company_id = excluded.company_id,
        role = case when public.ministry_memberships.role = 'leader' then 'leader' else 'member' end,
        status = 'active', left_at = null, reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at, joined_at = coalesce(public.ministry_memberships.joined_at, excluded.joined_at),
        updated_at = now()
      returning id
    `
    if (!rows[0]) throw new Error("Vínculo do ministério não foi salvo")
    await writeAuditLog({ action: "ministry.membership.manual_add", entityTable: "ministry_memberships", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, personId: parsed.personId } })
    refresh(parsed.ministryId)
    return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const teamSchema = z.object({ ministryId: uuid, companyId: optionalUuid, id: optionalUuid, name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000).default(""), leaderPersonId: optionalUuid, coLeaderPersonId: optionalUuid, coordinatorPersonId: optionalUuid, meetingDay: z.string().trim().max(30).default(""), meetingTime: z.string().trim().max(20).nullable().optional(), meetingLocation: z.string().trim().max(300).default(""), maxCapacity: z.number().int().min(0).max(10000).default(0), isActive: z.boolean().default(true) })

async function validateMinistryPeople(companyId: string, ministryId: string, people: (string | null)[]) {
  const ids = [...new Set(people.filter((value): value is string => Boolean(value)))]
  if (!ids.length) return
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    select person_id as id from public.ministry_memberships
    where company_id = ${companyId} and ministry_id = ${ministryId} and status = 'active' and left_at is null and person_id = any(${sql.array(ids)}::uuid[])
  `
  if (rows.length !== ids.length) throw new Error("Líderes e coordenadores precisam ser membros ativos do ministério")
}

export async function saveMinistryTeam(input: z.input<typeof teamSchema>): Promise<ActionResult> {
  try {
    const parsed = teamSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.teams.manage", parsed.companyId, { manage: true })
    await validateMinistryPeople(access.companyId, parsed.ministryId, [parsed.leaderPersonId, parsed.coLeaderPersonId, parsed.coordinatorPersonId])
    const sql = getSql()
    if (parsed.id && parsed.maxCapacity > 0) {
      const countRows = await sql<{ total: number }[]>`
        select count(member.id)::int as total
        from public.group_members member
        join public.groups team on team.id = member.group_id
        where team.id = ${parsed.id} and team.company_id = ${access.companyId}
          and team.ministry_id = ${parsed.ministryId} and team.type = 'ministry'
          and team.deleted_at is null and member.status = 'active'
      `
      if (Number(countRows[0]?.total ?? 0) > parsed.maxCapacity) throw new Error("A capacidade nova nÃ£o pode ser menor que o nÃºmero atual de membros")
    }
    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.groups set name = ${parsed.name}, description = ${parsed.description}, leader_person_id = ${parsed.leaderPersonId}, co_leader_person_id = ${parsed.coLeaderPersonId}, coordinator_person_id = ${parsed.coordinatorPersonId}, meeting_day = ${parsed.meetingDay}, meeting_time = ${parsed.meetingTime ?? null}::time, meeting_location = ${parsed.meetingLocation}, max_capacity = ${parsed.maxCapacity}, is_active = ${parsed.isActive}, updated_by = ${access.user.id}, updated_at = now()
          where id = ${parsed.id} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and type = 'ministry' and deleted_at is null returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.groups (company_id, ministry_id, name, description, type, leader_person_id, co_leader_person_id, coordinator_person_id, meeting_day, meeting_time, meeting_location, max_capacity, is_active, created_by, updated_by)
          values (${access.companyId}, ${parsed.ministryId}, ${parsed.name}, ${parsed.description}, 'ministry', ${parsed.leaderPersonId}, ${parsed.coLeaderPersonId}, ${parsed.coordinatorPersonId}, ${parsed.meetingDay}, ${parsed.meetingTime ?? null}::time, ${parsed.meetingLocation}, ${parsed.maxCapacity}, ${parsed.isActive}, ${access.user.id}, ${access.user.id}) returning id
        `
    if (!rows[0]) throw new Error("Equipe não encontrada")
    await writeAuditLog({ action: parsed.id ? "ministry.team.update" : "ministry.team.create", entityTable: "groups", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId } })
    refresh(parsed.ministryId)
    return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const teamMemberSchema = z.object({ ministryId: uuid, companyId: optionalUuid, groupId: uuid, personId: uuid, role: z.enum(["member", "leader", "co_leader", "host"]).default("member"), remove: z.boolean().default(false) })

export async function saveMinistryTeamMember(input: z.input<typeof teamMemberSchema>): Promise<ActionResult> {
  try {
    const parsed = teamMemberSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.teams.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const groupRows = await sql<{ id: string; max_capacity: number }[]>`
      select id, max_capacity from public.groups
      where id = ${parsed.groupId} and company_id = ${access.companyId}
        and ministry_id = ${parsed.ministryId} and type = 'ministry' and deleted_at is null
      limit 1
    `
    if (!groupRows[0]) throw new Error("Equipe não encontrada")
    if (!parsed.remove) {
      await validateMinistryPeople(access.companyId, parsed.ministryId, [parsed.personId])
      const existing = await sql<{ id: string }[]>`
        select id from public.group_members
        where company_id = ${access.companyId} and group_id = ${parsed.groupId}
          and person_id = ${parsed.personId} and status = 'active' limit 1
      `
      if (!existing[0] && Number(groupRows[0].max_capacity) > 0) {
        const counts = await sql<{ total: number }[]>`
          select count(*)::int as total from public.group_members
          where company_id = ${access.companyId} and group_id = ${parsed.groupId} and status = 'active'
        `
        if (Number(counts[0]?.total ?? 0) >= Number(groupRows[0].max_capacity)) throw new Error("A capacidade desta equipe já foi atingida")
      }
      await sql`
        insert into public.group_members (company_id, group_id, person_id, role, status, joined_at, created_by, updated_by)
        values (${access.companyId}, ${parsed.groupId}, ${parsed.personId}, ${parsed.role}, 'active', current_date, ${access.user.id}, ${access.user.id})
        on conflict (group_id, person_id) do update set role = excluded.role, status = 'active', left_at = null, updated_by = excluded.updated_by, updated_at = now()
      `
    } else {
      await sql`update public.group_members set status = 'inactive', left_at = current_date, updated_by = ${access.user.id}, updated_at = now() where company_id = ${access.companyId} and group_id = ${parsed.groupId} and person_id = ${parsed.personId}`
    }
    await writeAuditLog({ action: parsed.remove ? "ministry.team.member.remove" : "ministry.team.member.add", entityTable: "group_members", companyId: access.companyId, metadata: { ministryId: parsed.ministryId, groupId: parsed.groupId, personId: parsed.personId } })
    refresh(parsed.ministryId)
    return { ok: true }
  } catch (error) { return result(error) }
}

const agendaSchema = z.object({ ministryId: uuid, companyId: optionalUuid, id: optionalUuid, title: z.string().trim().min(2).max(200), description: z.string().trim().max(4000).default(""), startsAt: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(1).max(1440).default(60), kind: z.enum(["service", "cleaning", "rehearsal", "meeting", "outreach", "other"]).default("meeting"), location: z.string().trim().max(300).default(""), recurrenceFrequency: z.enum(["none", "weekly", "monthly"]).default("none"), recurrenceWeekdays: z.array(z.number().int().min(0).max(6)).default([]), recurrenceUntil: z.string().date().nullable().optional(), volunteerTemplateId: optionalUuid, isActive: z.boolean().default(true) })

export async function saveMinistryActivity(input: z.input<typeof agendaSchema>): Promise<ActionResult> {
  try {
    const parsed = agendaSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.agenda.manage", parsed.companyId, { manage: true })
    if (parsed.recurrenceFrequency === "weekly" && parsed.recurrenceWeekdays.length === 0) throw new Error("Selecione ao menos um dia da semana")
    const sql = getSql()
    const rows = parsed.id
      ? await sql<{ id: string }[]>`
          update public.programmings set title = ${parsed.title}, description = ${parsed.description}, starts_at = ${parsed.startsAt}::timestamptz, duration_minutes = ${parsed.durationMinutes}, kind = ${parsed.kind}, location = ${parsed.location}, recurrence_frequency = ${parsed.recurrenceFrequency}, recurrence_weekdays = ${parsed.recurrenceWeekdays}::smallint[], recurrence_until = ${parsed.recurrenceUntil ?? null}::date, is_recurring = ${parsed.recurrenceFrequency !== "none"}, volunteer_template_id = ${parsed.volunteerTemplateId}, is_active = ${parsed.isActive}, recurrence_needs_review = false, updated_by = ${access.user.id}, updated_at = now()
          where id = ${parsed.id} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and deleted_at is null returning id
        `
      : await sql<{ id: string }[]>`
          insert into public.programmings (company_id, ministry_id, title, description, starts_at, duration_minutes, is_recurring, recurrence_rule, kind, location, timezone, recurrence_frequency, recurrence_weekdays, recurrence_until, recurrence_needs_review, volunteer_template_id, is_active, created_by, updated_by)
          values (${access.companyId}, ${parsed.ministryId}, ${parsed.title}, ${parsed.description}, ${parsed.startsAt}::timestamptz, ${parsed.durationMinutes}, ${parsed.recurrenceFrequency !== "none"}, '', ${parsed.kind}, ${parsed.location}, 'America/Sao_Paulo', ${parsed.recurrenceFrequency}, ${parsed.recurrenceWeekdays}::smallint[], ${parsed.recurrenceUntil ?? null}::date, false, ${parsed.volunteerTemplateId}, ${parsed.isActive}, ${access.user.id}, ${access.user.id}) returning id
        `
    if (!rows[0]) throw new Error("Atividade não encontrada")
    await sql`select public.materialize_volunteer_programmings(${access.companyId}::uuid, 90)`
    await writeAuditLog({ action: parsed.id ? "ministry.activity.update" : "ministry.activity.create", entityTable: "programmings", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId } })
    refresh(parsed.ministryId)
    return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const scalePositionSchema = z.object({
  ministryId: uuid,
  companyId: optionalUuid,
  eventId: uuid,
  positions: z.array(z.object({
    roleName: z.string().trim().min(2).max(120),
    requiredVolunteers: z.number().int().min(1).max(100),
    instructions: z.string().trim().max(2000).default(""),
  })).min(1).max(50),
})

async function ensureMinistryVolunteerDepartment(access: Awaited<ReturnType<typeof requireMinistryPermission>>) {
  const sql = getSql()
  const existing = await sql<{ id: string }[]>`
    select id from public.volunteer_departments
    where company_id = ${access.companyId} and ministry_id = ${access.ministryId}
      and deleted_at is null limit 1
  `
  if (existing[0]) return existing[0].id
  const ministryRows = await sql<{ name: string }[]>`
    select name from public.ministries
    where id = ${access.ministryId} and company_id = ${access.companyId} and deleted_at is null limit 1
  `
  if (!ministryRows[0]) throw new Error("Ministério não encontrado")
  const rows = await sql<{ id: string }[]>`
    insert into public.volunteer_departments (
      company_id, ministry_id, manager_profile_id, name, description, is_active, created_by, updated_by
    ) values (
      ${access.companyId}, ${access.ministryId}, ${access.user.id},
      ${`Ministério: ${ministryRows[0].name}`},
      'Departamento técnico usado pelas escalas deste ministério.', true, ${access.user.id}, ${access.user.id}
    ) returning id
  `
  if (!rows[0]) throw new Error("Departamento técnico do ministério não foi criado")
  return rows[0].id
}

async function ensureMinistryVolunteerRole(companyId: string, departmentId: string, roleName: string, actorId: string, instructions: string) {
  const sql = getSql()
  const existing = await sql<{ id: string }[]>`
    select id from public.volunteer_department_roles
    where company_id = ${companyId} and department_id = ${departmentId}
      and lower(name) = lower(${roleName}) and deleted_at is null limit 1
  `
  if (existing[0]) {
    await sql`
      update public.volunteer_department_roles
      set name = ${roleName}, instructions = ${instructions}, is_active = true, updated_at = now()
      where id = ${existing[0].id} and company_id = ${companyId}
    `
    return existing[0].id
  }
  const rows = await sql<{ id: string }[]>`
    insert into public.volunteer_department_roles (
      company_id, department_id, name, description, instructions, is_active
    ) values (${companyId}, ${departmentId}, ${roleName}, '', ${instructions}, true) returning id
  `
  if (!rows[0]) throw new Error("Função da escala não foi criada")
  void actorId
  return rows[0].id
}

async function getMinistryScaleEvent(access: Awaited<ReturnType<typeof requireMinistryPermission>>, eventId: string) {
  const sql = getSql()
  const rows = await sql<{ id: string; title: string; starts_at: Date | string; ends_at: Date | string | null; status: string; volunteer_schedule_published_at: Date | string | null }[]>`
    select id, title, starts_at, ends_at, status, volunteer_schedule_published_at
    from public.events
    where id = ${eventId} and company_id = ${access.companyId} and ministry_id = ${access.ministryId}
      and deleted_at is null limit 1
  `
  if (!rows[0]) throw new Error("Atividade não pertence a este ministério")
  if (rows[0].status === "cancelled") throw new Error("Atividade cancelada não pode receber escala")
  return rows[0]
}

export async function saveMinistryScalePositions(input: z.input<typeof scalePositionSchema>): Promise<ActionResult> {
  try {
    const parsed = scalePositionSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.agenda.manage", parsed.companyId, { manage: true })
    const event = await getMinistryScaleEvent(access, parsed.eventId)
    if (event.volunteer_schedule_published_at) throw new Error("A escala publicada não pode ser alterada")
    const roleKeys = parsed.positions.map((position) => position.roleName.toLocaleLowerCase("pt-BR"))
    if (new Set(roleKeys).size !== roleKeys.length) throw new Error("Cada função precisa ter um nome diferente")
    const departmentId = await ensureMinistryVolunteerDepartment(access)
    const roles = new Map<string, string>()
    for (const position of parsed.positions) roles.set(position.roleName.toLocaleLowerCase("pt-BR"), await ensureMinistryVolunteerRole(access.companyId, departmentId, position.roleName, access.user.id, position.instructions))
    const sql = getSql()
    const saved = await sql.begin(async (tx) => {
      const keptIds: string[] = []
      for (const [index, position] of parsed.positions.entries()) {
        const roleId = roles.get(position.roleName.toLocaleLowerCase("pt-BR"))
        if (!roleId) throw new Error("Função inválida")
        const rows = await tx<{ id: string }[]>`
          insert into public.volunteer_event_positions (
            company_id, event_id, department_id, role_id, role_name,
            required_volunteers, instructions, sort_order, created_by, updated_by
          ) values (
            ${access.companyId}, ${parsed.eventId}, ${departmentId}, ${roleId}, ${position.roleName},
            ${position.requiredVolunteers}, ${position.instructions}, ${index}, ${access.user.id}, ${access.user.id}
          ) on conflict (event_id, department_id, role_id) do update set
            role_name = excluded.role_name, required_volunteers = excluded.required_volunteers,
            instructions = excluded.instructions, sort_order = excluded.sort_order,
            updated_by = excluded.updated_by, updated_at = now()
          returning id
        `
        if (rows[0]) keptIds.push(rows[0].id)
      }
      await tx`
        delete from public.volunteer_event_positions
        where event_id = ${parsed.eventId} and company_id = ${access.companyId}
          and id <> all(${keptIds}::uuid[])
      `
      return keptIds
    })
    await writeAuditLog({ action: "ministry.scale.positions.save", entityTable: "volunteer_event_positions", entityId: parsed.eventId, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, positions: saved.length, departmentId } })
    refresh(parsed.ministryId)
    return { ok: true, id: parsed.eventId, data: { departmentId, positionIds: saved } }
  } catch (error) { return result(error) }
}

export async function generateMinistryScale(input: { ministryId: string; eventId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId)
    const eventId = uuid.parse(input.eventId)
    const access = await requireMinistryPermission(ministryId, "ministries.agenda.manage", input.companyId, { manage: true })
    const event = await getMinistryScaleEvent(access, eventId)
    if (event.volunteer_schedule_published_at) throw new Error("A escala deste evento já foi publicada")
    const sql = getSql()
    const positions = await sql<{ id: string; department_id: string; role_id: string; role_name: string; required_volunteers: number; instructions: string }[]>`
      select id, department_id, role_id, role_name, required_volunteers, instructions
      from public.volunteer_event_positions
      where event_id = ${eventId} and company_id = ${access.companyId}
      order by sort_order, role_name
    `
    if (!positions.length) throw new Error("Adicione ao menos uma função antes de montar a escala")
    const monthRows = await sql<{ month: string }[]>`
      select to_char(starts_at at time zone 'America/Sao_Paulo', 'YYYY-MM-01') as month
      from public.events where id = ${eventId} limit 1
    `
    const month = monthRows[0]?.month
    if (!month) throw new Error("Mês da escala não encontrado")
    const scheduleRows = await sql<{ id: string; status: "draft" | "published" | "archived" }[]>`
      insert into public.volunteer_schedules (company_id, month, created_by, updated_by)
      values (${access.companyId}, ${month}::date, ${access.user.id}, ${access.user.id})
      on conflict (company_id, month) do update set updated_by = excluded.updated_by, updated_at = now()
      returning id, status
    `
    const schedule = scheduleRows[0]
    if (!schedule) throw new Error("Escala não foi criada")
    if (schedule.status === "published") throw new Error("O mês desta escala já foi publicado")
    const startsAt = new Date(event.starts_at)
    const endsAt = event.ends_at ? new Date(event.ends_at) : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000)
    const opensAt = new Date(startsAt.getTime() - 30 * 60 * 1000)
    const closesAt = new Date(endsAt.getTime() + 30 * 60 * 1000)
    const positionIds = positions.map((position) => position.id)
    await sql.begin(async (tx) => {
      await tx`
        delete from public.volunteer_shifts
        where schedule_id = ${schedule.id} and event_id = ${eventId}
          and (event_position_id is null or event_position_id <> all(${positionIds}::uuid[]))
      `
      for (const position of positions) {
        await tx`
          insert into public.volunteer_shifts (
            company_id, schedule_id, event_id, event_position_id, department_id, role_id,
            role_name, required_volunteers, instructions, starts_at, ends_at,
            checkin_opens_at, checkin_closes_at
          ) values (
            ${access.companyId}, ${schedule.id}, ${eventId}, ${position.id}, ${position.department_id}, ${position.role_id},
            ${position.role_name}, ${position.required_volunteers}, ${position.instructions}, ${startsAt}, ${endsAt}, ${opensAt}, ${closesAt}
          ) on conflict (schedule_id, event_id, event_position_id) where event_position_id is not null do update set
            department_id = excluded.department_id, role_id = excluded.role_id, role_name = excluded.role_name,
            required_volunteers = excluded.required_volunteers, instructions = excluded.instructions,
            starts_at = excluded.starts_at, ends_at = excluded.ends_at,
            checkin_opens_at = excluded.checkin_opens_at, checkin_closes_at = excluded.checkin_closes_at,
            updated_at = now()
        `
      }
    })
    await writeAuditLog({ action: "ministry.scale.generate", entityTable: "volunteer_schedules", entityId: schedule.id, companyId: access.companyId, metadata: { ministryId, eventId, positions: positions.length } })
    refresh(ministryId)
    return { ok: true, id: schedule.id, data: { eventId, positions: positions.length } }
  } catch (error) { return result(error) }
}

async function getMinistryShift(access: Awaited<ReturnType<typeof requireMinistryPermission>>, shiftId: string) {
  const sql = getSql()
  const rows = await sql<{ id: string; event_id: string; department_id: string; role_name: string; required_volunteers: number; starts_at: Date | string; ends_at: Date | string | null; event_title: string }[]>`
    select shift.id, shift.event_id, shift.department_id, shift.role_name, shift.required_volunteers,
      shift.starts_at, coalesce(shift.ends_at, shift.starts_at + interval '2 hours') as ends_at,
      event.title as event_title
    from public.volunteer_shifts shift
    join public.events event on event.id = shift.event_id
    where shift.id = ${shiftId} and shift.company_id = ${access.companyId}
      and event.company_id = ${access.companyId} and event.ministry_id = ${access.ministryId}
      and event.deleted_at is null limit 1
  `
  if (!rows[0]) throw new Error("Vaga da escala não encontrada")
  return rows[0]
}

async function loadMinistryScaleCandidates(access: Awaited<ReturnType<typeof requireMinistryPermission>>, shift: Awaited<ReturnType<typeof getMinistryShift>>) {
  const sql = getSql()
  const people = await sql<{ person_id: string; person_name: string; volunteer_id: string | null; registration_status: string | null; desired_services_per_month: number | null; max_services_per_month: number | null; minimum_rest_hours: number | null }[]>`
    select membership.person_id, person.full_name as person_name, volunteer.id as volunteer_id,
      volunteer.registration_status, volunteer.desired_services_per_month, volunteer.max_services_per_month,
      volunteer.minimum_rest_hours
    from public.ministry_memberships membership
    join public.people person on person.id = membership.person_id
      and person.company_id = ${access.companyId} and person.is_active and person.deleted_at is null
    left join public.volunteer_profiles volunteer on volunteer.person_id = membership.person_id
      and volunteer.company_id = ${access.companyId} and volunteer.deleted_at is null
    where membership.company_id = ${access.companyId} and membership.ministry_id = ${access.ministryId}
      and membership.status = 'active' and membership.left_at is null
    order by person.full_name
  `
  const candidates: SchedulerCandidateInput[] = []
  for (const person of people) {
    const volunteerId = person.volunteer_id ? String(person.volunteer_id) : null
    const [rules, exceptions, history] = volunteerId
      ? await Promise.all([
          sql<Record<string, unknown>[]>`select weekday, available, starts_at, ends_at, valid_from, valid_until from public.volunteer_availability_rules where volunteer_id = ${volunteerId}`,
          sql<Record<string, unknown>[]>`select starts_at, ends_at, available from public.volunteer_availability_exceptions where volunteer_id = ${volunteerId}`,
          sql<Record<string, unknown>[]>`select other_shift.starts_at, coalesce(other_shift.ends_at, other_shift.starts_at + interval '2 hours') as ends_at, assignment.status, other_shift.role_name from public.volunteer_assignments assignment join public.volunteer_shifts other_shift on other_shift.id = assignment.shift_id and other_shift.company_id = ${access.companyId} where assignment.volunteer_id = ${volunteerId} and assignment.company_id = ${access.companyId}`,
        ])
      : [[], [], []]
    candidates.push({
      id: volunteerId ?? person.person_id,
      name: person.person_name,
      active: true,
      departmentIds: [shift.department_id],
      roleNames: [shift.role_name],
      desiredServicesPerMonth: Number(person.desired_services_per_month ?? 2),
      maxServicesPerMonth: Number(person.max_services_per_month ?? 4),
      minimumRestHours: Number(person.minimum_rest_hours ?? 12),
      preference: 0,
      availabilityRules: rules.map((row) => ({
        weekday: Number(row.weekday), available: Boolean(row.available),
        startsAt: row.starts_at ? String(row.starts_at).slice(0, 5) : null,
        endsAt: row.ends_at ? String(row.ends_at).slice(0, 5) : null,
        validFrom: row.valid_from ? String(row.valid_from).slice(0, 10) : null,
        validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
      })),
      availabilityExceptions: exceptions.map((row) => ({ startsAt: String(row.starts_at), endsAt: String(row.ends_at), available: Boolean(row.available) })),
      assignments: history.map((row) => ({ startsAt: String(row.starts_at), endsAt: String(row.ends_at), status: String(row.status), roleName: String(row.role_name) })),
    })
  }
  const ranked = rankVolunteersForShift(candidates, {
    id: shift.id,
    departmentId: shift.department_id,
    roleName: shift.role_name,
    requiredVolunteers: Number(shift.required_volunteers),
    startsAt: new Date(shift.starts_at).toISOString(),
    endsAt: new Date(shift.ends_at ?? shift.starts_at).toISOString(),
    timezone: "America/Sao_Paulo",
  })
  const byId = new Map(people.map((person) => [person.volunteer_id ?? person.person_id, person]))
  return ranked.map((candidate) => {
    const person = byId.get(candidate.volunteerId)
    const manual = withManualSelectionRules(candidate)
    return {
      personId: person?.person_id ?? candidate.volunteerId,
      personName: person?.person_name ?? candidate.volunteerName,
      volunteerId: person?.volunteer_id ?? null,
      selectableManually: manual.selectableManually,
      eligible: manual.eligible,
      score: manual.score,
      warnings: person?.volunteer_id ? manual.warnings : ["O vínculo técnico de voluntariado será criado ao selecionar."],
      blockers: manual.blockers,
    }
  })
}

export async function listMinistryScaleCandidates(input: { ministryId: string; shiftId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId)
    const shiftId = uuid.parse(input.shiftId)
    const access = await requireMinistryPermission(ministryId, "ministries.agenda.manage", input.companyId, { manage: true })
    const shift = await getMinistryShift(access, shiftId)
    return { ok: true, id: shiftId, data: await loadMinistryScaleCandidates(access, shift) }
  } catch (error) { return result(error) }
}

const scaleAssignmentSchema = z.object({ ministryId: uuid, companyId: optionalUuid, shiftId: uuid, personId: uuid, remove: z.boolean().default(false) })

async function ensureMinistryVolunteerProfile(companyId: string, personId: string, actorId: string) {
  const sql = getSql()
  const rows = await sql<{ id: string }[]>`
    insert into public.volunteer_profiles (company_id, person_id, registration_status, whatsapp_enabled, email_enabled, created_by, updated_by)
    values (${companyId}, ${personId}, 'active', false, false, ${actorId}, ${actorId})
    on conflict (person_id) do update set registration_status = 'active', deleted_at = null, updated_by = excluded.updated_by, updated_at = now()
      where public.volunteer_profiles.company_id = excluded.company_id
    returning id
  `
  if (!rows[0]) throw new Error("Vínculo técnico de voluntariado não foi criado")
  return rows[0].id
}

async function ensureMinistryVolunteerMembership(companyId: string, departmentId: string, volunteerId: string, roleId: string, roleName: string) {
  const sql = getSql()
  await sql`
    insert into public.volunteer_department_memberships (
      company_id, department_id, volunteer_id, role_name, role_id, preferred, is_active
    ) values (${companyId}, ${departmentId}, ${volunteerId}, ${roleName}, ${roleId}, true, true)
    on conflict (department_id, volunteer_id, role_name) do update set
      role_id = excluded.role_id, preferred = true, is_active = true, updated_at = now()
  `
}

export async function saveMinistryScaleAssignment(input: z.input<typeof scaleAssignmentSchema>): Promise<ActionResult> {
  try {
    const parsed = scaleAssignmentSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.agenda.manage", parsed.companyId, { manage: true })
    const shift = await getMinistryShift(access, parsed.shiftId)
    const sql = getSql()
    const memberRows = await sql<{ person_id: string }[]>`
      select person_id from public.ministry_memberships
      where company_id = ${access.companyId} and ministry_id = ${access.ministryId}
        and person_id = ${parsed.personId} and status = 'active' and left_at is null limit 1
    `
    if (!memberRows[0]) throw new Error("Somente membros ativos do ministério podem ser escalados")
    const departmentRows = await sql<{ id: string }[]>`select id from public.volunteer_departments where id = ${shift.department_id} and company_id = ${access.companyId} and ministry_id = ${access.ministryId} and deleted_at is null limit 1`
    if (!departmentRows[0]) throw new Error("Departamento da escala fora do escopo")
    const volunteerRows = await sql<{ id: string; registration_status: string }[]>`select id, registration_status from public.volunteer_profiles where company_id = ${access.companyId} and person_id = ${parsed.personId} and deleted_at is null limit 1`
    if (parsed.remove) {
      if (!volunteerRows[0]) throw new Error("Pessoa não está atribuída nesta escala")
      const rows = await sql<{ id: string }[]>`
        update public.volunteer_assignments assignment
        set status = 'cancelled', updated_by = ${access.user.id}, updated_at = now()
        where assignment.shift_id = ${shift.id} and assignment.volunteer_id = ${volunteerRows[0].id}
          and assignment.status not in ('declined', 'cancelled') returning assignment.id
      `
      if (!rows[0]) throw new Error("Pessoa não está atribuída nesta escala")
      await writeAuditLog({ action: "ministry.scale.assignment.remove", entityTable: "volunteer_assignments", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: access.ministryId, shiftId: shift.id, personId: parsed.personId } })
      refresh(access.ministryId)
      return { ok: true, id: rows[0].id }
    }
    const existingVolunteerId = volunteerRows[0]?.id
    if (existingVolunteerId) {
      const existing = await sql<{ id: string }[]>`
        select id from public.volunteer_assignments
        where shift_id = ${shift.id} and volunteer_id = ${existingVolunteerId}
          and status not in ('declined', 'cancelled') limit 1
      `
      if (existing[0]) return { ok: true, id: existing[0].id }
    }
    const candidates = await loadMinistryScaleCandidates(access, shift)
    const candidate = candidates.find((item) => item.personId === parsed.personId)
    if (!candidate?.selectableManually) throw new Error(candidate?.blockers.join("; ") || "Pessoa indisponível para este horário")
    const volunteerId = volunteerRows[0]?.registration_status === "active"
      ? volunteerRows[0].id
      : await ensureMinistryVolunteerProfile(access.companyId, parsed.personId, access.user.id)
    const roleRows = await sql<{ id: string }[]>`
      select id from public.volunteer_department_roles
      where company_id = ${access.companyId} and department_id = ${shift.department_id}
        and lower(name) = lower(${shift.role_name}) and deleted_at is null limit 1
    `
    if (!roleRows[0]) throw new Error("Função técnica da escala não encontrada")
    await ensureMinistryVolunteerMembership(access.companyId, shift.department_id, volunteerId, roleRows[0].id, shift.role_name)
    const capacity = await sql<{ filled: number }[]>`
      select count(*) filter (where status not in ('declined', 'cancelled'))::int as filled
      from public.volunteer_assignments where shift_id = ${shift.id}
    `
    if (Number(capacity[0]?.filled ?? 0) >= Number(shift.required_volunteers)) throw new Error("Todas as vagas desta função já foram preenchidas")
    const rows = await sql<{ id: string }[]>`
      insert into public.volunteer_assignments (
        company_id, shift_id, volunteer_id, status, score, score_reasons, is_locked, created_by, updated_by
      ) values (
        ${access.companyId}, ${shift.id}, ${volunteerId}, 'proposed', ${candidate.score},
        ${JSON.stringify([{ code: "manual", label: "Escolha manual do líder", points: 0 }])}::jsonb,
        true, ${access.user.id}, ${access.user.id}
      ) returning id
    `
    if (!rows[0]) throw new Error("Pessoa não foi adicionada à escala")
    await writeAuditLog({ action: "ministry.scale.assignment.save", entityTable: "volunteer_assignments", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: access.ministryId, shiftId: shift.id, personId: parsed.personId } })
    refresh(access.ministryId)
    return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

export async function publishMinistryScale(input: { ministryId: string; eventId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId)
    const eventId = uuid.parse(input.eventId)
    const access = await requireMinistryPermission(ministryId, "ministries.agenda.manage", input.companyId, { manage: true })
    const event = await getMinistryScaleEvent(access, eventId)
    if (event.volunteer_schedule_published_at) return { ok: true, id: eventId }
    const sql = getSql()
    const shifts = await sql<{ id: string; role_name: string; required_volunteers: number }[]>`
      select id, role_name, required_volunteers from public.volunteer_shifts
      where company_id = ${access.companyId} and event_id = ${eventId}
    `
    if (!shifts.length) throw new Error("Monte a escala antes de publicar")
    const incomplete = await sql<{ role_name: string; missing: number }[]>`
      select shift.role_name,
        shift.required_volunteers - count(assignment.id) filter (where assignment.status not in ('declined', 'cancelled'))::int as missing
      from public.volunteer_shifts shift
      left join public.volunteer_assignments assignment on assignment.shift_id = shift.id
      where shift.company_id = ${access.companyId} and shift.event_id = ${eventId}
      group by shift.id, shift.role_name, shift.required_volunteers
      having count(assignment.id) filter (where assignment.status not in ('declined', 'cancelled')) < shift.required_volunteers
      order by shift.role_name
    `
    if (incomplete.length) throw new Error(`Faltam pessoas: ${incomplete.map((item) => `${item.role_name} (${item.missing})`).join(", ")}`)
    const recipients = await sql<{ assignment_id: string; volunteer_id: string; email: string | null; phone: string; email_enabled: boolean; whatsapp_enabled: boolean; push_enabled: boolean }[]>`
      select assignment.id as assignment_id, volunteer.id as volunteer_id, person.email, person.phone,
        coalesce(preference.email_enabled, volunteer.email_enabled) as email_enabled,
        coalesce(preference.whatsapp_enabled, volunteer.whatsapp_enabled) as whatsapp_enabled,
        coalesce(preference.push_enabled, false) as push_enabled
      from public.volunteer_assignments assignment
      join public.volunteer_shifts shift on shift.id = assignment.shift_id
      join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
        and volunteer.company_id = ${access.companyId} and volunteer.deleted_at is null
      join public.people person on person.id = volunteer.person_id
        and person.company_id = ${access.companyId} and person.deleted_at is null
      left join public.volunteer_notification_preferences preference on preference.volunteer_id = volunteer.id
      where assignment.company_id = ${access.companyId} and shift.company_id = ${access.companyId} and shift.event_id = ${eventId}
        and assignment.status not in ('declined', 'cancelled')
    `
    await sql.begin(async (tx) => {
      await tx`
        update public.volunteer_assignments assignment
        set status = 'notified', notified_at = coalesce(notified_at, now()), updated_by = ${access.user.id}, updated_at = now()
        from public.volunteer_shifts shift
        where assignment.shift_id = shift.id and shift.company_id = ${access.companyId}
          and shift.event_id = ${eventId} and assignment.status = 'proposed'
      `
      for (const recipient of recipients) {
        const content = `Sua escala foi publicada: ${event.title} em ${new Date(event.starts_at).toLocaleString("pt-BR")}.`
        if (recipient.whatsapp_enabled && recipient.phone) await tx`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content)
          values (${access.companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'whatsapp', ${recipient.phone}, 'Sua escala', ${content})
          on conflict (assignment_id, volunteer_id, channel) where assignment_id is not null do nothing
        `
        if (recipient.email_enabled && recipient.email) await tx`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content)
          values (${access.companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'email', ${recipient.email}, 'Sua escala publicada', ${content})
          on conflict (assignment_id, volunteer_id, channel) where assignment_id is not null do nothing
        `
        if (recipient.push_enabled) await tx`
          insert into public.volunteer_delivery_outbox (company_id, volunteer_id, assignment_id, channel, recipient, subject, content, event_kind, payload)
          values (${access.companyId}, ${recipient.volunteer_id}, ${recipient.assignment_id}, 'push', '', 'Nova escala', ${content}, 'schedule', ${JSON.stringify({ url: "/voluntariado", assignmentId: recipient.assignment_id })}::jsonb)
          on conflict (assignment_id, volunteer_id, channel) where assignment_id is not null do nothing
        `
      }
      await tx`
        update public.events set volunteer_schedule_published_at = now(), updated_by = ${access.user.id}, updated_at = now()
        where id = ${eventId} and company_id = ${access.companyId}
      `
    })
    await writeAuditLog({ action: "ministry.scale.publish", entityTable: "events", entityId: eventId, companyId: access.companyId, metadata: { ministryId, recipients: recipients.length } })
    refresh(ministryId)
    return { ok: true, id: eventId, data: { recipients: recipients.length } }
  } catch (error) { return result(error) }
}

const attendanceSchema = z.object({ ministryId: uuid, companyId: optionalUuid, eventId: uuid, personId: uuid, status: z.enum(["present", "absent", "justified"]), occurredOn: z.string().date() })

export async function recordMinistryAttendance(input: z.input<typeof attendanceSchema>): Promise<ActionResult> {
  try {
    const parsed = attendanceSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.attendance.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const rows = await sql<{ id: string; person_name: string }[]>`
      select event.id, person.full_name as person_name from public.events event join public.people person on person.id = ${parsed.personId}
      where event.id = ${parsed.eventId} and event.company_id = ${access.companyId} and event.ministry_id = ${parsed.ministryId} and event.deleted_at is null
        and exists (select 1 from public.ministry_memberships membership where membership.ministry_id = ${parsed.ministryId} and membership.person_id = ${parsed.personId} and membership.status = 'active')
      limit 1
    `
    if (!rows[0]) throw new Error("Pessoa ou atividade fora do escopo do ministério")
    const saved = await sql<{ id: string }[]>`
      insert into public.attendance_records (company_id, person_id, person_name, event_type, event_ref_id, event_ref_name, occurred_on, status, registered_by, registered_by_name)
      values (${access.companyId}, ${parsed.personId}, ${rows[0].person_name}, 'ministry', ${parsed.eventId}, (select title from public.events where id = ${parsed.eventId}), ${parsed.occurredOn}::date, ${parsed.status}, ${access.user.id}, ${access.user.name})
      on conflict (company_id, event_ref_id, person_id, event_type) where deleted_at is null and event_type = 'ministry' and person_id is not null and event_ref_id is not null
      do update set person_name = excluded.person_name, occurred_on = excluded.occurred_on, status = excluded.status, registered_by = excluded.registered_by, registered_by_name = excluded.registered_by_name, updated_at = now()
      returning id
    `
    await writeAuditLog({ action: "ministry.attendance.save", entityTable: "attendance_records", entityId: saved[0]?.id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, eventId: parsed.eventId, personId: parsed.personId, status: parsed.status } })
    refresh(parsed.ministryId)
    return { ok: true, id: saved[0]?.id }
  } catch (error) { return result(error) }
}

const communicationSchema = z.object({ ministryId: uuid, companyId: optionalUuid, title: z.string().trim().min(2).max(200), content: z.string().trim().min(2).max(10000), method: z.enum(["push", "email", "whatsapp"]), audience: z.enum(["ministry", "team", "manual"]).default("ministry"), audienceRefId: optionalUuid, personIds: z.array(uuid).default([]), scheduledAt: z.string().datetime({ offset: true }).nullable().optional() })

export async function createMinistryCommunication(input: z.input<typeof communicationSchema>): Promise<ActionResult> {
  try {
    const parsed = communicationSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.communication.send", parsed.companyId, { manage: true })
    const sql = getSql()
    const audience: NotificationAudience = parsed.audience === "team" ? "ministry_team" : parsed.audience === "manual" ? "manual" : "ministry"
    let audienceRefId = parsed.audience === "team" ? parsed.audienceRefId : parsed.ministryId
    let personIds = [...new Set(parsed.personIds)]
    if (audience === "ministry_team") {
      if (!audienceRefId) throw new Error("Selecione uma equipe")
      const teamRows = await sql<{ id: string }[]>`select id from public.groups where id = ${audienceRefId} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and type = 'ministry' and is_active and deleted_at is null limit 1`
      if (!teamRows[0]) throw new Error("Equipe fora do escopo")
      const rows = await sql<{ person_id: string }[]>`
        select distinct members.person_id
        from public.group_members members
        where members.company_id = ${access.companyId} and members.group_id = ${audienceRefId}
          and members.status = 'active'
          and exists (
            select 1 from public.ministry_memberships membership
            where membership.company_id = ${access.companyId} and membership.ministry_id = ${parsed.ministryId}
              and membership.person_id = members.person_id and membership.status = 'active' and membership.left_at is null
          )
      `
      personIds = [...new Set(rows.map((row) => row.person_id))]
    } else if (audience === "manual") {
      if (!personIds.length) throw new Error("Selecione ao menos uma pessoa")
      const valid = await sql<{ person_id: string }[]>`select person_id from public.ministry_memberships where company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and status = 'active' and left_at is null and person_id = any(${sql.array(personIds)}::uuid[])`
      if (valid.length !== new Set(personIds).size) throw new Error("A seleção contém pessoa fora do ministério")
      audienceRefId = null
    }
    const scheduledAt = parsed.scheduledAt ? new Date(parsed.scheduledAt).toISOString() : null
    const saved = await sql.begin(async (tx) => {
      const campaigns = await tx<{ id: string }[]>`
        insert into public.notifications (company_id, title, content, method, type, target_group, scheduled_send, send_date, scheduled_at, audience_kind, audience_ref_id, audience_person_ids, snapshot_at, snapshot_count, status, created_by, updated_by)
        values (${access.companyId}, ${parsed.title}, ${parsed.content}, ${parsed.method}, 'group', ${audienceRefId ?? ""}, ${Boolean(scheduledAt)}, ${scheduledAt ? scheduledAt.slice(0, 10) : null}, ${scheduledAt}, ${audience}, ${audienceRefId}, ${tx.json(personIds)}, now(), 0, ${scheduledAt ? "scheduled" : "queued"}, ${access.user.id}, ${access.user.id}) returning id
      `
      const campaign = campaigns[0]
      if (!campaign) throw new Error("Campanha não foi criada")
      const snapshot = await createNotificationCampaignDeliveries(tx, { notificationId: campaign.id, companyId: access.companyId, channel: parsed.method, audience, audienceRefId, personIds, nextAttemptAt: scheduledAt })
      await tx`update public.notifications set audience_person_ids = ${tx.json(snapshot.personIds)}, snapshot_count = ${snapshot.deliveryCount}, snapshot_at = now(), updated_at = now() where id = ${campaign.id}`
      return campaign.id
    })
    await writeAuditLog({ action: "ministry.communication.create", entityTable: "notifications", entityId: saved, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, audience, audienceRefId } })
    refresh(parsed.ministryId)
    return { ok: true, id: saved }
  } catch (error) { return result(error) }
}

const followUpSchema = z.object({ ministryId: uuid, companyId: optionalUuid, personId: uuid, title: z.string().trim().min(2).max(200), notes: z.string().trim().max(5000).default(""), dueAt: z.string().datetime({ offset: true }).nullable().optional(), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), responsibleProfileId: optionalUuid, sourceKey: z.string().trim().max(200).nullable().optional() })

export async function saveMinistryFollowUp(input: z.input<typeof followUpSchema>): Promise<ActionResult> {
  try {
    const parsed = followUpSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.follow_up.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const valid = await sql<{ id: string }[]>`select id from public.ministry_memberships where company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and person_id = ${parsed.personId} and status = 'active' and left_at is null limit 1`
    if (!valid[0]) throw new Error("Pessoa não é membro ativo do ministério")
    if (parsed.responsibleProfileId) {
      const responsible = await sql<{ id: string }[]>`
        select id from public.profiles
        where id = ${parsed.responsibleProfileId} and company_id = ${access.companyId} and active
        limit 1
      `
      if (!responsible[0]) throw new Error("Responsável inválido")
    }
    const rows = await sql<{ id: string }[]>`
      insert into public.person_follow_up_tasks (company_id, person_id, ministry_id, responsible_profile_id, title, notes, due_at, priority, status, origin, source_key, created_by, updated_by)
      values (${access.companyId}, ${parsed.personId}, ${parsed.ministryId}, ${parsed.responsibleProfileId}, ${parsed.title}, ${parsed.notes}, ${parsed.dueAt ? new Date(parsed.dueAt).toISOString() : null}, ${parsed.priority}, 'open', 'ministry_manual', ${parsed.sourceKey ?? null}, ${access.user.id}, ${access.user.id})
      on conflict (company_id, source_key) where source_key is not null and deleted_at is null do update set title = excluded.title, notes = excluded.notes, due_at = excluded.due_at, priority = excluded.priority, responsible_profile_id = excluded.responsible_profile_id, updated_by = excluded.updated_by, updated_at = now()
      returning id
    `
    await writeAuditLog({ action: "ministry.follow_up.save", entityTable: "person_follow_up_tasks", entityId: rows[0]?.id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, personId: parsed.personId } })
    refresh(parsed.ministryId)
    return { ok: true, id: rows[0]?.id }
  } catch (error) { return result(error) }
}

export async function completeMinistryFollowUp(input: { ministryId: string; taskId: string; companyId?: string | null; status: "completed" | "open" | "in_progress" | "canceled" }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId); const taskId = uuid.parse(input.taskId); const status = z.enum(["completed", "open", "in_progress", "canceled"]).parse(input.status)
    const access = await requireMinistryPermission(ministryId, "ministries.follow_up.manage", input.companyId, { manage: true })
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`update public.person_follow_up_tasks set status = ${status}, completed_at = case when ${status} = 'completed' then now() else null end, updated_by = ${access.user.id}, updated_at = now() where id = ${taskId} and ministry_id = ${ministryId} and company_id = ${access.companyId} and deleted_at is null returning id`
    if (!rows[0]) throw new Error("Follow-up não encontrado")
    refresh(ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const onboardingTemplateSchema = z.object({ ministryId: uuid, companyId: optionalUuid, id: optionalUuid, name: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).default(""), isActive: z.boolean().default(true) })

export async function saveMinistryOnboardingTemplate(input: z.input<typeof onboardingTemplateSchema>): Promise<ActionResult> {
  try {
    const parsed = onboardingTemplateSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.members.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const rows = parsed.id
      ? await sql<{ id: string }[]>`update public.ministry_onboarding_templates set name = ${parsed.name}, description = ${parsed.description}, is_active = ${parsed.isActive}, updated_by = ${access.user.id}, updated_at = now() where id = ${parsed.id} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`insert into public.ministry_onboarding_templates (company_id, ministry_id, name, description, is_active, created_by, updated_by) values (${access.companyId}, ${parsed.ministryId}, ${parsed.name}, ${parsed.description}, ${parsed.isActive}, ${access.user.id}, ${access.user.id}) returning id`
    if (!rows[0]) throw new Error("Checklist não encontrado")
    await writeAuditLog({ action: parsed.id ? "ministry.onboarding.template.update" : "ministry.onboarding.template.create", entityTable: "ministry_onboarding_templates", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId } })
    refresh(parsed.ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

export async function removeMinistryOnboardingTemplate(input: { ministryId: string; templateId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId); const templateId = uuid.parse(input.templateId)
    const access = await requireMinistryPermission(ministryId, "ministries.members.manage", input.companyId, { manage: true })
    const rows = await getSql()<{ id: string }[]>`update public.ministry_onboarding_templates set deleted_at = now(), updated_by = ${access.user.id}, updated_at = now() where id = ${templateId} and ministry_id = ${ministryId} and company_id = ${access.companyId} and deleted_at is null returning id`
    if (!rows[0]) throw new Error("Checklist não encontrado")
    await writeAuditLog({ action: "ministry.onboarding.template.delete", entityTable: "ministry_onboarding_templates", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId } })
    refresh(ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const onboardingStepSchema = z.object({ ministryId: uuid, companyId: optionalUuid, templateId: uuid, id: optionalUuid, title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).default(""), sortOrder: z.number().int().min(0).max(10000).default(0), isRequired: z.boolean().default(true) })

export async function saveMinistryOnboardingStep(input: z.input<typeof onboardingStepSchema>): Promise<ActionResult> {
  try {
    const parsed = onboardingStepSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.members.manage", parsed.companyId, { manage: true })
    const sql = getSql()
    const templateRows = await sql<{ id: string }[]>`select id from public.ministry_onboarding_templates where id = ${parsed.templateId} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and deleted_at is null limit 1`
    if (!templateRows[0]) throw new Error("Checklist não encontrado")
    const rows = parsed.id
      ? await sql<{ id: string }[]>`update public.ministry_onboarding_steps set title = ${parsed.title}, description = ${parsed.description}, sort_order = ${parsed.sortOrder}, is_required = ${parsed.isRequired}, updated_at = now() where id = ${parsed.id} and company_id = ${access.companyId} and template_id = ${parsed.templateId} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`insert into public.ministry_onboarding_steps (company_id, template_id, title, description, sort_order, is_required) values (${access.companyId}, ${parsed.templateId}, ${parsed.title}, ${parsed.description}, ${parsed.sortOrder}, ${parsed.isRequired}) returning id`
    if (!rows[0]) throw new Error("Etapa não encontrada")
    await writeAuditLog({ action: parsed.id ? "ministry.onboarding.step.update" : "ministry.onboarding.step.create", entityTable: "ministry_onboarding_steps", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, templateId: parsed.templateId } })
    refresh(parsed.ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

export async function removeMinistryOnboardingStep(input: { ministryId: string; stepId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId); const stepId = uuid.parse(input.stepId)
    const access = await requireMinistryPermission(ministryId, "ministries.members.manage", input.companyId, { manage: true })
    const rows = await getSql()<{ id: string }[]>`update public.ministry_onboarding_steps step set deleted_at = now(), updated_at = now() from public.ministry_onboarding_templates template where step.id = ${stepId} and step.template_id = template.id and template.ministry_id = ${ministryId} and template.company_id = ${access.companyId} and step.deleted_at is null returning step.id`
    if (!rows[0]) throw new Error("Etapa não encontrada")
    await writeAuditLog({ action: "ministry.onboarding.step.delete", entityTable: "ministry_onboarding_steps", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId } })
    refresh(ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

const resourceSchema = z.object({ ministryId: uuid, companyId: optionalUuid, id: optionalUuid, title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).default(""), category: z.string().trim().max(80).default("geral"), fileId: optionalUuid, externalUrl: z.string().url().nullable().optional(), visibility: z.enum(["leaders", "members", "public"]).default("members"), sortOrder: z.number().int().min(0).max(10000).default(0) })

export async function saveMinistryResource(input: z.input<typeof resourceSchema>): Promise<ActionResult> {
  try {
    const parsed = resourceSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.dashboard.view", parsed.companyId, { manage: true })
    if (!parsed.fileId && !parsed.externalUrl) throw new Error("Informe arquivo ou URL")
    const sql = getSql()
    const rows = parsed.id
      ? await sql<{ id: string }[]>`update public.ministry_resources set title = ${parsed.title}, description = ${parsed.description}, category = ${parsed.category}, file_id = ${parsed.fileId}, external_url = ${parsed.externalUrl ?? null}, visibility = ${parsed.visibility}, sort_order = ${parsed.sortOrder}, updated_at = now() where id = ${parsed.id} and ministry_id = ${parsed.ministryId} and company_id = ${access.companyId} and deleted_at is null returning id`
      : await sql<{ id: string }[]>`insert into public.ministry_resources (company_id, ministry_id, title, description, category, file_id, external_url, visibility, sort_order, author_profile_id) values (${access.companyId}, ${parsed.ministryId}, ${parsed.title}, ${parsed.description}, ${parsed.category}, ${parsed.fileId}, ${parsed.externalUrl ?? null}, ${parsed.visibility}, ${parsed.sortOrder}, ${access.user.id}) returning id`
    if (!rows[0]) throw new Error("Recurso não encontrado")
    refresh(parsed.ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

export async function uploadMinistryResource(formData: FormData): Promise<ActionResult> {
  let uploadedId: string | null = null
  let uploadedCompanyId: string | null = null
  try {
    const parsed = resourceSchema.parse({
      ministryId: formData.get("ministryId"), companyId: formData.get("companyId"), title: formData.get("title"),
      description: formData.get("description") ?? "", category: formData.get("category") ?? "geral",
      visibility: formData.get("visibility") ?? "members", sortOrder: Number(formData.get("sortOrder") ?? 0), fileId: null, externalUrl: null,
    })
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.dashboard.view", parsed.companyId, { manage: true })
    uploadedCompanyId = access.companyId
    const file = getOptionalFile(formData, "file")
    if (!file) throw new Error("Selecione um arquivo")
    const uploaded = await uploadManagedFile({
      file, companyId: access.companyId, ownerProfileId: access.user.id, entityTable: "ministry_resources", purpose: "resource",
      visibility: parsed.visibility === "public" ? "public" : "private",
      allowedMimeTypes: new Set(["application/pdf", "text/plain", "image/jpeg", "image/png", "image/webp", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]),
      allowedExtensions: new Set([".pdf", ".txt", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]), allowGenericMimeByExtension: true,
    })
    uploadedId = uploaded.id
    const sql = getSql()
    const rows = await sql<{ id: string }[]>`insert into public.ministry_resources (company_id, ministry_id, title, description, category, file_id, visibility, sort_order, author_profile_id) values (${access.companyId}, ${parsed.ministryId}, ${parsed.title}, ${parsed.description}, ${parsed.category}, ${uploaded.id}, ${parsed.visibility}, ${parsed.sortOrder}, ${access.user.id}) returning id`
    await sql`update public.app_files set entity_id = ${rows[0].id} where id = ${uploaded.id} and company_id = ${access.companyId}`
    await writeAuditLog({ action: "ministry.resource.upload", entityTable: "ministry_resources", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: parsed.ministryId, fileId: uploaded.id, mimeType: uploaded.mimeType, sizeBytes: uploaded.sizeBytes } })
    refresh(parsed.ministryId); return { ok: true, id: rows[0].id }
  } catch (error) {
    if (uploadedId && uploadedCompanyId) await deleteManagedFile(uploadedId, uploadedCompanyId).catch(() => undefined)
    return result(error)
  }
}

export async function removeMinistryResource(input: { ministryId: string; resourceId: string; companyId?: string | null }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId); const resourceId = uuid.parse(input.resourceId)
    const access = await requireMinistryPermission(ministryId, "ministries.dashboard.view", input.companyId, { manage: true })
    const rows = await getSql()<{ id: string }[]>`update public.ministry_resources set deleted_at = now(), updated_at = now() where id = ${resourceId} and ministry_id = ${ministryId} and company_id = ${access.companyId} and deleted_at is null returning id`
    if (!rows[0]) throw new Error("Recurso não encontrado")
    await writeAuditLog({ action: "ministry.resource.delete", entityTable: "ministry_resources", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId } })
    refresh(ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}

export async function setMinistryOnboardingStep(input: { ministryId: string; membershipId: string; stepId: string; companyId?: string | null; completed: boolean }): Promise<ActionResult> {
  try {
    const ministryId = uuid.parse(input.ministryId); const membershipId = uuid.parse(input.membershipId); const stepId = uuid.parse(input.stepId)
    const access = await requireMinistryPermission(ministryId, "ministries.dashboard.view", input.companyId)
    const sql = getSql()
    const membershipRows = await sql<{ person_id: string }[]>`select person_id from public.ministry_memberships where id = ${membershipId} and company_id = ${access.companyId} and ministry_id = ${ministryId} and status = 'active' and left_at is null limit 1`
    if (!membershipRows[0] || (!access.canManage && membershipRows[0].person_id !== access.personId)) throw new Error("Você só pode atualizar seu próprio onboarding")
    const rows = await sql<{ id: string }[]>`
      insert into public.ministry_member_onboarding (company_id, ministry_id, membership_id, step_id, completed_at, completed_by)
      select ${access.companyId}, ${ministryId}, membership.id, step.id, case when ${input.completed} then now() else null end, case when ${input.completed} then ${access.user.id} else null end
      from public.ministry_memberships membership
      join public.ministry_onboarding_steps step on step.id = ${stepId}
      join public.ministry_onboarding_templates template on template.id = step.template_id and template.ministry_id = ${ministryId} and template.company_id = ${access.companyId} and template.deleted_at is null
      where membership.id = ${membershipId} and membership.ministry_id = ${ministryId} and membership.company_id = ${access.companyId} and step.deleted_at is null
      on conflict (membership_id, step_id) do update set completed_at = excluded.completed_at, completed_by = excluded.completed_by, updated_at = now()
      returning id
    `
    if (!rows[0]) throw new Error("Etapa de onboarding não encontrada")
    refresh(ministryId); return { ok: true, id: rows[0].id }
  } catch (error) { return result(error) }
}
