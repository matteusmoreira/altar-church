"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { writeAuditLog } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import { deleteManagedFile, getOptionalFile, uploadManagedFile } from "@/lib/files/server"
import { createNotificationCampaignDeliveries, type NotificationAudience } from "@/lib/notifications/campaign"
import { requireMinistryPermission } from "./access"

type ActionResult = { ok: boolean; id?: string; error?: string }

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
    const rows = await sql<{ id: string }[]>`
      update public.ministries set
        name = ${parsed.name}, ministry_type = ${parsed.ministryType}, mission = ${parsed.mission}, description = ${parsed.description},
        target_audience = ${parsed.targetAudience}, contact = ${parsed.contact}, meeting_day = ${parsed.meetingDay ?? null},
        meeting_time = ${parsed.meetingTime ?? null}::time, meeting_location = ${parsed.meetingLocation}, image_file_id = ${parsed.imageFileId},
        public_join_enabled = ${parsed.publicJoinEnabled}, is_active = ${parsed.isActive}, updated_by = ${access.user.id}, updated_at = now()
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
    const groupRows = await sql<{ id: string }[]>`select id from public.groups where id = ${parsed.groupId} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and type = 'ministry' and deleted_at is null limit 1`
    if (!groupRows[0]) throw new Error("Equipe não encontrada")
    if (!parsed.remove) {
      await validateMinistryPeople(access.companyId, parsed.ministryId, [parsed.personId])
      await sql`
        insert into public.group_members (company_id, group_id, person_id, role, status, joined_at, created_by, updated_by)
        values (${access.companyId}, ${parsed.groupId}, ${parsed.personId}, ${parsed.role}, 'active', current_date, ${access.user.id}, ${access.user.id})
        on conflict (group_id, person_id) do update set role = excluded.role, status = 'active', left_at = null, updated_by = excluded.updated_by, updated_at = now()
      `
    } else {
      await sql`update public.group_members set status = 'inactive', left_at = current_date, updated_by = ${access.user.id}, updated_at = now() where group_id = ${parsed.groupId} and person_id = ${parsed.personId}`
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
    let personIds = parsed.personIds
    if (audience === "ministry_team") {
      if (!audienceRefId) throw new Error("Selecione uma equipe")
      const teamRows = await sql<{ id: string }[]>`select id from public.groups where id = ${audienceRefId} and company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and type = 'ministry' and deleted_at is null limit 1`
      if (!teamRows[0]) throw new Error("Equipe fora do escopo")
      const rows = await sql<{ person_id: string }[]>`select person_id from public.group_members where company_id = ${access.companyId} and group_id = ${audienceRefId} and status = 'active'`
      personIds = rows.map((row) => row.person_id)
    } else if (audience === "manual") {
      if (!personIds.length) throw new Error("Selecione ao menos uma pessoa")
      const valid = await sql<{ person_id: string }[]>`select person_id from public.ministry_memberships where company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and status = 'active' and person_id = any(${sql.array(personIds)}::uuid[])`
      if (valid.length !== personIds.length) throw new Error("A seleção contém pessoa fora do ministério")
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
      await tx`update public.notifications set snapshot_count = ${snapshot.deliveryCount}, snapshot_at = now(), updated_at = now() where id = ${campaign.id}`
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
    const valid = await sql<{ id: string }[]>`select id from public.ministry_memberships where company_id = ${access.companyId} and ministry_id = ${parsed.ministryId} and person_id = ${parsed.personId} and status = 'active' limit 1`
    if (!valid[0]) throw new Error("Pessoa não é membro ativo do ministério")
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
