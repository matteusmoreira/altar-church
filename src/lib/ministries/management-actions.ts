"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { getSql } from "@/lib/db/client"
import { writeAuditLog } from "@/lib/auth/permissions"
import { requireMinistryPermission } from "./access"
import { getMinistryReport } from "./data"
import { followUpSchema, reportPeriod, reportPeriodSchema } from "./management-contract"
import type { MinistryFollowUp, MinistryManagementData, MinistryPersonHistory } from "./management-contract"
import type { ActionResult } from "./actions"
import { copyScaleTransaction } from "./scale-copy"

function failure(error: unknown): ActionResult {
  return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Não foi possível concluir" }
}
function refresh() {
  revalidatePath("/ministerios/[id]", "page")
  revalidatePath("/membro/ministerios/[id]", "page")
  revalidatePath("/pessoas/follow-up")
}
export async function loadMinistryManagement(ministryId: string): Promise<ActionResult> {
  try {
    const access = await requireMinistryPermission(z.string().uuid().parse(ministryId), "ministries.dashboard.view")
    const sql = getSql()
    const zones = await sql<{ timezone: string }[]>`select timezone from public.church_profiles where company_id = ${access.companyId}`
    const timezone = zones[0]?.timezone || "America/Sao_Paulo"
    const period = reportPeriod(30, timezone)
    const [attendance, followUps, responsibles] = await Promise.all([
      sql<{ eventId: string; title: string; day: string; present: number; absent: number; justified: number }[]>`
        select e.id as "eventId", e.title, a.occurred_on::text as day,
          count(*) filter(where a.status='present')::int as present,
          count(*) filter(where a.status='absent')::int as absent,
          count(*) filter(where a.status='justified')::int as justified
        from public.attendance_records a join public.events e on e.id=a.event_ref_id
        where a.company_id=${access.companyId} and e.company_id=${access.companyId} and e.ministry_id=${access.ministryId}
          and a.event_type='ministry' and a.deleted_at is null and e.deleted_at is null
          and a.occurred_on between ${period.from}::date and ${period.to}::date
        group by e.id,a.occurred_on order by a.occurred_on,e.title`,
      access.canManage ? sql<MinistryFollowUp[]>`
        select t.id,t.person_id as "personId",p.full_name as "personName",t.title,t.notes,
          coalesce(t.next_action,'') as "nextAction",t.responsible_profile_id as "responsibleProfileId",
          r.name as "responsibleName",t.due_at::text as "dueAt",t.priority,t.status
        from public.person_follow_up_tasks t join public.people p on p.id=t.person_id and p.company_id=t.company_id
        left join public.profiles r on r.id=t.responsible_profile_id and r.company_id=t.company_id
        where t.company_id=${access.companyId} and t.ministry_id=${access.ministryId} and t.deleted_at is null
        order by t.due_at nulls last,t.created_at desc` : Promise.resolve([]),
      access.canManage ? sql<{ id: string; name: string }[]>`
        select r.id,r.name as name from public.profiles r
        where r.company_id=${access.companyId} and r.active and (
          coalesce(r.roles,array[r.role]::text[]) && array['superadmin','admin','pastor']::text[] or exists (
            select 1 from public.ministry_memberships m where m.person_id=r.person_id and m.company_id=r.company_id
              and m.ministry_id=${access.ministryId} and m.status='active' and m.left_at is null and m.role in ('leader','coordinator')))
        order by r.name` : Promise.resolve([]),
    ])
    const data: MinistryManagementData = { timezone, attendance, followUps: followUps.map(task => ({ ...task, dueAt: task.dueAt ? new Date(task.dueAt).toISOString() : null })), responsibles }
    return { ok: true, data }
  } catch (error) { return failure(error) }
}

export async function saveMinistryFollowUp(input: z.input<typeof followUpSchema>): Promise<ActionResult> {
  try {
    const parsed = followUpSchema.parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.follow_up.manage", undefined, { manage: true })
    const sql = getSql()
    const rows = await sql.begin(async tx => {
      const members = await tx`select m.id from public.ministry_memberships m join public.people p on p.id=m.person_id
        where m.company_id=${access.companyId} and m.ministry_id=${access.ministryId} and m.person_id=${parsed.personId}
          and p.company_id=${access.companyId} and p.deleted_at is null limit 1`
      if (!members[0]) throw new Error("Pessoa não pertence a este ministério")
      if (parsed.responsibleProfileId) {
        const managers = await tx`select r.id from public.profiles r where r.id=${parsed.responsibleProfileId}
          and r.company_id=${access.companyId} and r.active and (
            coalesce(r.roles,array[r.role]::text[]) && array['superadmin','admin','pastor']::text[] or exists (
              select 1 from public.ministry_memberships m where m.person_id=r.person_id and m.company_id=r.company_id
                and m.ministry_id=${access.ministryId} and m.status='active' and m.left_at is null and m.role in ('leader','coordinator')))`
        if (!managers[0]) throw new Error("Responsável sem acesso de gestão a este ministério")
      }
      if (parsed.id) return tx<{ id: string }[]>`update public.person_follow_up_tasks set
        person_id=${parsed.personId}, title=${parsed.title}, notes=${parsed.notes}, next_action=${parsed.nextAction},
        responsible_profile_id=${parsed.responsibleProfileId},due_at=${parsed.dueAt},priority=${parsed.priority},status=${parsed.status},
        completed_at=case when ${parsed.status}='completed' then coalesce(completed_at,now()) else null end,
        updated_by=${access.user.id},updated_at=now()
        where id=${parsed.id} and company_id=${access.companyId} and ministry_id=${access.ministryId} and person_id=${parsed.personId} and deleted_at is null returning id`
      return tx<{ id: string }[]>`insert into public.person_follow_up_tasks
        (company_id,ministry_id,person_id,title,notes,next_action,responsible_profile_id,due_at,priority,status,origin,created_by,updated_by,completed_at)
        values (${access.companyId},${access.ministryId},${parsed.personId},${parsed.title},${parsed.notes},${parsed.nextAction},
          ${parsed.responsibleProfileId},${parsed.dueAt},${parsed.priority},${parsed.status},'ministry_manual',${access.user.id},${access.user.id},
          case when ${parsed.status}='completed' then now() else null end) returning id`
    })
    if (!rows[0]) throw new Error("Acompanhamento não encontrado neste ministério")
    await writeAuditLog({ action: parsed.id ? "ministry.follow_up.update" : "ministry.follow_up.create", entityTable: "person_follow_up_tasks", entityId: rows[0].id, companyId: access.companyId, metadata: { ministryId: access.ministryId, status: parsed.status } })
    refresh()
    return { ok: true, id: rows[0].id }
  } catch (error) { return failure(error) }
}

export async function loadMinistryPersonHistory(ministryId: string, personId: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(personId)
    const access = await requireMinistryPermission(z.string().uuid().parse(ministryId), "ministries.members.manage", undefined, { manage: true })
    const sql = getSql()
    const member = await sql`select id from public.ministry_memberships where company_id=${access.companyId} and ministry_id=${access.ministryId} and person_id=${personId}`
    if (!member[0]) throw new Error("Pessoa não pertence a este ministério")
    const [assignments, attendance] = await Promise.all([
      sql<MinistryPersonHistory["assignments"]>`select a.id,e.title,s.starts_at::text as "startsAt",s.role_name as "roleName",a.status
        from public.volunteer_assignments a join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=a.company_id
        join public.volunteer_shifts s on s.id=a.shift_id and s.company_id=a.company_id
        join public.events e on e.id=s.event_id and e.company_id=a.company_id
        where a.company_id=${access.companyId} and v.person_id=${personId} and e.ministry_id=${access.ministryId}
          and e.deleted_at is null order by s.starts_at desc limit 100`,
      sql<MinistryPersonHistory["attendance"]>`select a.id,e.title,a.occurred_on::text as day,a.status
        from public.attendance_records a join public.events e on e.id=a.event_ref_id and e.company_id=a.company_id
        where a.company_id=${access.companyId} and a.person_id=${personId} and a.event_type='ministry'
          and e.ministry_id=${access.ministryId} and e.deleted_at is null and a.deleted_at is null order by a.occurred_on desc limit 100`,
    ])
    return { ok: true, data: { assignments, attendance } satisfies MinistryPersonHistory }
  } catch (error) { return failure(error) }
}

export async function loadMinistryReport(ministryId: string, period: { from: string; to: string }): Promise<ActionResult> {
  try { return { ok: true, data: await getMinistryReport(ministryId, undefined, reportPeriodSchema.parse(period)) } }
  catch (error) { return failure(error) }
}

export async function copyMinistryScale(input: { ministryId: string; sourceEventId: string; targetEventId: string }): Promise<ActionResult> {
  try {
    const parsed = z.object({ ministryId: z.string().uuid(), sourceEventId: z.string().uuid(), targetEventId: z.string().uuid() }).parse(input)
    const access = await requireMinistryPermission(parsed.ministryId, "ministries.agenda.manage", undefined, { manage: true })
    const data = await getSql().begin(tx => copyScaleTransaction(tx, access, parsed.sourceEventId, parsed.targetEventId))
    await writeAuditLog({ action: "ministry.scale.copy", entityTable: "events", entityId: parsed.targetEventId, companyId: access.companyId, metadata: { ministryId: access.ministryId, sourceEventId: parsed.sourceEventId, ...data } })
    refresh()
    return { ok: true, id: parsed.targetEventId, data }
  } catch (error) { return failure(error) }
}

export async function loadMinistryScaleSources(ministryId: string): Promise<ActionResult> {
  try {
    const access = await requireMinistryPermission(z.string().uuid().parse(ministryId), "ministries.agenda.manage", undefined, { manage: true })
    const data = await getSql()<{ id: string; title: string; startsAt: string }[]>`select e.id,e.title,e.starts_at::text as "startsAt" from public.events e
      where e.company_id=${access.companyId} and e.ministry_id=${access.ministryId} and e.deleted_at is null and e.status<>'cancelled'
        and exists(select 1 from public.volunteer_event_positions p where p.event_id=e.id and p.company_id=e.company_id)
      order by e.starts_at desc limit 100`
    return { ok: true, data }
  } catch(error) { return failure(error) }
}
