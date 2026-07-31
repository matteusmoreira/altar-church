import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { requirePermission } from "@/lib/auth/permissions"
import { getSql } from "@/lib/db/client"
import type {
  PersonFollowUpPriority,
  PersonFollowUpStatus,
  PersonFollowUpTask,
  PersonFollowUpTrigger,
  PersonTimelineItem,
} from "./types"

type TimelineRow = {
  id: string
  kind: PersonTimelineItem["kind"]
  title: string
  description: string
  occurred_at: Date | string
  source: string
}

type TaskRow = {
  id: string
  person_id: string
  person_name: string
  title: string
  notes: string
  due_at: Date | string | null
  priority: PersonFollowUpPriority
  status: PersonFollowUpStatus
  origin: string
  responsible_profile_id: string | null
  responsible_name: string | null
  crm_card_id: string | null
  created_at: Date | string
  completed_at: Date | string | null
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null
}

function toTask(row: TaskRow): PersonFollowUpTask {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    title: row.title,
    notes: row.notes,
    dueAt: iso(row.due_at),
    priority: row.priority,
    status: row.status,
    origin: row.origin,
    responsibleProfileId: row.responsible_profile_id,
    responsibleName: row.responsible_name,
    crmCardId: row.crm_card_id,
    createdAt: iso(row.created_at) ?? "",
    completedAt: iso(row.completed_at),
  }
}

async function resolveCompany(companyIdInput?: string | null) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Acesso negado")
  return { user, companyId: requireUserCompanyId(user, companyIdInput) }
}

export async function listPersonTimeline(personId: string, companyIdInput?: string | null): Promise<PersonTimelineItem[]> {
  const { companyId } = await resolveCompany(companyIdInput)
  await requirePermission("members.view", companyId)
  const sql = getSql()
  const rows = await sql<TimelineRow[]>`
    select * from (
      select p.id::text as id, 'person'::text as kind, 'Cadastro da pessoa'::text as title,
        'Pessoa criada no cadastro'::text as description, p.created_at as occurred_at, 'people'::text as source
      from public.people p
      where p.id = ${personId} and p.company_id = ${companyId} and p.deleted_at is null

      union all
      select ar.id::text, 'attendance', 'Presença registrada',
        coalesce(nullif(ar.event_ref_name, ''), nullif(ar.event_type, ''), 'Participação registrada'),
        coalesce(ar.checkin_at, ar.created_at, ar.occurred_on::timestamptz), 'attendance'
      from public.attendance_records ar
      where ar.person_id = ${personId} and ar.company_id = ${companyId} and ar.deleted_at is null

      union all
      select gm.id::text, 'cell', 'Participação em célula',
        coalesce(nullif(gm.title, ''), 'Reunião de célula'), gm.starts_at, 'group_meetings'
      from public.group_meetings gm
      inner join public.group_members member on member.group_id = gm.group_id and member.person_id = ${personId}
        and member.company_id = ${companyId} and member.status = 'active'
      where gm.company_id = ${companyId} and gm.deleted_at is null

      union all
      select membership.id::text, 'ministry', 'Vínculo com ministério',
        case when membership.status = 'active' then 'Participação ativa' else 'Status: ' || membership.status end,
        coalesce(membership.joined_at, membership.created_at), 'ministry_memberships'
      from public.ministry_memberships membership
      where membership.person_id = ${personId} and membership.company_id = ${companyId}

      union all
      select attendance.id::text, 'kids', 'Registro no Kids',
        coalesce(nullif(attendance.classroom_name, ''), 'Presença registrada'), attendance.checked_in_at, 'kid_attendances'
      from public.kid_attendances attendance
      inner join public.kid_profiles kid on kid.id = attendance.kid_id and kid.company_id = ${companyId}
      where attendance.company_id = ${companyId}
        and (kid.person_id = ${personId} or exists (
          select 1 from public.kid_guardians guardian
          where guardian.kid_id = kid.id and guardian.person_id = ${personId}
            and guardian.company_id = ${companyId} and guardian.deleted_at is null
        ))

      union all
      select assignment.id::text, 'volunteer', 'Escala de voluntariado',
        coalesce(nullif(shift.role_name, ''), 'Serviço escalado'), shift.starts_at, 'volunteer_assignments'
      from public.volunteer_assignments assignment
      inner join public.volunteer_profiles volunteer on volunteer.id = assignment.volunteer_id
        and volunteer.person_id = ${personId} and volunteer.company_id = ${companyId} and volunteer.deleted_at is null
      inner join public.volunteer_shifts shift on shift.id = assignment.shift_id and shift.company_id = ${companyId}
      where assignment.company_id = ${companyId} and assignment.status <> 'declined'

      union all
      select card.id::text, 'crm', 'Card no CRM',
        coalesce(nullif(card.source, ''), 'Follow-up comercial/pastoral'), card.created_at, 'crm_cards'
      from public.crm_cards card
      where card.person_id = ${personId} and card.company_id = ${companyId} and card.deleted_at is null

      union all
      select request.id::text, 'prayer', 'Pedido de oração registrado',
        case when request.status is null or request.status = '' then 'Pedido recebido' else 'Status: ' || request.status end,
        request.created_at, 'prayer_requests'
      from public.prayer_requests request
      inner join public.profiles prayer_profile on prayer_profile.company_id = ${companyId}
        and (prayer_profile.auth_user_id = request.user_id or prayer_profile.id = request.user_id)
        and prayer_profile.person_id = ${personId}
      where request.company_id = ${companyId} and request.deleted_at is null

      union all
      select delivery.id::text, 'communication', 'Comunicação enviada',
        coalesce(nullif(campaign.title, ''), delivery.channel), delivery.sent_at, 'notification_deliveries'
      from public.notification_deliveries delivery
      inner join public.notifications campaign on campaign.id = delivery.notification_id
        and campaign.company_id = ${companyId} and campaign.deleted_at is null
      where delivery.person_id = ${personId} and delivery.company_id = ${companyId} and delivery.status = 'sent'

      union all
      select audit.id::text, 'audit', 'Registro de auditoria',
        case when audit.action like '%export%' then 'Exportação autorizada' else 'Alteração registrada' end,
        audit.created_at, 'audit_logs'
      from public.audit_logs audit
      where audit.company_id = ${companyId}
        and audit.entity_table = 'people' and audit.entity_id = ${personId}
    ) timeline
    where occurred_at is not null
    order by occurred_at desc, id desc
    limit 500
  `
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    occurredAt: iso(row.occurred_at) ?? "",
    source: row.source,
  }))
}

export async function listPersonFollowUpTasks(personId?: string | null, companyIdInput?: string | null, filters?: {
  status?: PersonFollowUpStatus | "all"
  responsibleProfileId?: string | "all"
  cellId?: string | "all"
  journeyStatus?: string | "all"
}): Promise<PersonFollowUpTask[]> {
  const { companyId } = await resolveCompany(companyIdInput)
  await requirePermission("members.view", companyId)
  const sql = getSql()
  const rows = await sql<TaskRow[]>`
    select
      task.id, task.person_id, person.full_name as person_name, task.title, task.notes, task.due_at,
      task.priority, task.status, task.origin, task.responsible_profile_id,
      responsible.name as responsible_name, task.crm_card_id, task.created_at, task.completed_at
    from public.person_follow_up_tasks task
    inner join public.people person on person.id = task.person_id and person.company_id = ${companyId} and person.deleted_at is null
    left join public.profiles responsible on responsible.id = task.responsible_profile_id and responsible.company_id = ${companyId}
    where task.company_id = ${companyId}
      and task.deleted_at is null
      and (${personId ?? null}::uuid is null or task.person_id = ${personId ?? null}::uuid)
      and (${filters?.status && filters.status !== "all" ? filters.status : null}::text is null or task.status = ${filters?.status && filters.status !== "all" ? filters.status : null})
      and (${filters?.responsibleProfileId && filters.responsibleProfileId !== "all" ? filters.responsibleProfileId : null}::uuid is null or task.responsible_profile_id = ${filters?.responsibleProfileId && filters.responsibleProfileId !== "all" ? filters.responsibleProfileId : null}::uuid)
      and (${filters?.journeyStatus && filters.journeyStatus !== "all" ? filters.journeyStatus : null}::text is null or person.journey_status = ${filters?.journeyStatus && filters.journeyStatus !== "all" ? filters.journeyStatus : null})
      and (${filters?.cellId && filters.cellId !== "all" ? filters.cellId : null}::uuid is null or exists (
        select 1 from public.group_members membership
        where membership.company_id = ${companyId} and membership.person_id = task.person_id
          and membership.group_id = ${filters?.cellId && filters.cellId !== "all" ? filters.cellId : null}::uuid
          and membership.status = 'active'
      ))
    order by task.status = 'completed', task.due_at nulls last, task.created_at desc
    limit 500
  `
  return rows.map(toTask)
}

export async function listFollowUpResponsibleOptions(companyIdInput?: string | null) {
  const { companyId } = await resolveCompany(companyIdInput)
  await requirePermission("members.view", companyId)
  const rows = await getSql()<{ id: string; name: string }[]>`
    select id, name from public.profiles
    where company_id = ${companyId} and active = true
    order by name, id
  `
  return rows
}

export async function listFollowUpTriggers(companyIdInput?: string | null): Promise<PersonFollowUpTrigger[]> {
  const { companyId } = await resolveCompany(companyIdInput)
  await requirePermission("crm.view", companyId)
  const rows = await getSql()<{ id: string; trigger_kind: string; name: string; is_active: boolean; config: Record<string, unknown> }[]>`
    select id, trigger_kind, name, is_active, config
    from public.person_follow_up_triggers
    where company_id = ${companyId} and deleted_at is null
    order by name, id
  `
  return rows.map((row) => ({
    id: row.id,
    triggerKind: row.trigger_kind,
    name: row.name,
    isActive: row.is_active,
    config: row.config ?? {},
  }))
}

export async function processFollowUpTriggers(companyIdInput?: string | null, limit = 100) {
  const companyId = companyIdInput ?? null
  const sql = getSql()
  const triggers = await sql<{ id: string; trigger_kind: string; name: string }[]>`
    select id, trigger_kind, name from public.person_follow_up_triggers
    where deleted_at is null and is_active = true
      and (${companyId}::uuid is null or company_id = ${companyId}::uuid)
    order by company_id, trigger_kind
  `
  let created = 0
  for (const trigger of triggers) {
    const companies = await sql<{ company_id: string }[]>`
      select distinct company_id from public.person_follow_up_triggers
      where id = ${trigger.id}
    `
    for (const company of companies) {
      const candidates = trigger.trigger_kind === "new_visitor"
        ? await sql<{ person_id: string; source_key: string }[]>`
            select id as person_id, ${trigger.trigger_kind} || ':' || id::text as source_key
            from public.people
            where company_id = ${company.company_id} and deleted_at is null and is_active = true and status = 'visitor'
              and created_at >= now() - interval '30 days'
            order by created_at desc limit ${limit}
          `
        : trigger.trigger_kind === "visitor_without_contact"
          ? await sql<{ person_id: string; source_key: string }[]>`
              select id, ${trigger.trigger_kind} || ':' || id::text
              from public.people
              where company_id = ${company.company_id} and deleted_at is null and is_active = true and status = 'visitor'
                and nullif(btrim(coalesce(email, '')), '') is null and nullif(btrim(coalesce(phone, '')), '') is null
                and created_at >= now() - interval '30 days'
              order by created_at desc limit ${limit}
            `
          : trigger.trigger_kind === "without_cell"
            ? await sql<{ person_id: string; source_key: string }[]>`
                select person.id, ${trigger.trigger_kind} || ':' || person.id::text
                from public.people person
                where person.company_id = ${company.company_id} and person.deleted_at is null and person.is_active = true
                  and not exists (
                    select 1 from public.group_members membership
                    inner join public.groups cell on cell.id = membership.group_id and cell.type = 'cell' and cell.deleted_at is null
                    where membership.company_id = person.company_id and membership.person_id = person.id and membership.status = 'active'
                  )
                order by person.created_at desc limit ${limit}
              `
            : trigger.trigger_kind === "without_portal_access"
              ? await sql<{ person_id: string; source_key: string }[]>`
                  select person.id, ${trigger.trigger_kind} || ':' || person.id::text
                  from public.people person
                  where person.company_id = ${company.company_id} and person.deleted_at is null and person.is_active = true
                    and (person.profile_id is null or not exists (
                      select 1 from public.profiles profile where profile.id = person.profile_id and profile.active = true
                    ))
                  order by person.created_at desc limit ${limit}
                `
              : trigger.trigger_kind === "new_prayer_request"
                ? await sql<{ person_id: string; source_key: string }[]>`
                    select profile.person_id, ${trigger.trigger_kind} || ':' || request.id::text
                    from public.prayer_requests request
                    inner join public.profiles profile on (profile.auth_user_id = request.user_id or profile.id = request.user_id)
                      and profile.company_id = ${company.company_id} and profile.person_id is not null
                    where request.company_id = ${company.company_id} and request.deleted_at is null
                      and request.created_at >= now() - interval '30 days'
                    order by request.created_at desc limit ${limit}
                  `
                : await sql<{ person_id: string; source_key: string }[]>`
                    select person.id, ${trigger.trigger_kind} || ':' || person.id::text || ':' || to_char(current_date, 'YYYY-MM')
                    from public.people person
                    where person.company_id = ${company.company_id} and person.deleted_at is null and person.is_active = true
                      and exists (
                        select 1 from public.attendance_records old_attendance
                        where old_attendance.company_id = person.company_id and old_attendance.person_id = person.id
                          and old_attendance.deleted_at is null and old_attendance.occurred_on >= current_date - 90
                      )
                      and not exists (
                        select 1 from public.attendance_records recent_attendance
                        where recent_attendance.company_id = person.company_id and recent_attendance.person_id = person.id
                          and recent_attendance.deleted_at is null and recent_attendance.occurred_on >= current_date - 30
                      )
                    order by person.created_at desc limit ${limit}
                  `
      for (const candidate of candidates) {
        const rows = await sql<{ id: string }[]>`
          insert into public.person_follow_up_tasks (
            company_id, person_id, title, notes, priority, status, origin, source_key
          )
          values (
            ${company.company_id}, ${candidate.person_id}, ${trigger.name},
            'Criada automaticamente por gatilho configurado.', 'normal', 'open', ${trigger.trigger_kind}, ${candidate.source_key}
          )
          on conflict do nothing
          returning id
        `
        if (rows[0]?.id) {
          created += 1
          await sql`
            insert into public.audit_logs (company_id, action, entity_table, entity_id, metadata)
            values (${company.company_id}, 'person_follow_up_task.auto_create', 'person_follow_up_tasks', ${rows[0].id}, ${JSON.stringify({ triggerId: trigger.id, personId: candidate.person_id })}::jsonb)
          `
        }
      }
    }
  }
  return { triggers: triggers.length, created }
}
