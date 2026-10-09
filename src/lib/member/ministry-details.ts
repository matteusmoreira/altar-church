import "server-only"
import { z } from "zod"
import { getSql } from "@/lib/db/client"
import { resolveMinistryAccess } from "@/lib/ministries/access"
import { badRequest } from "@/lib/api/errors"
import { createSignedUrlsByStoragePath } from "@/lib/files/server"
import type { MemberMinistryDetails, MemberMinistryActivity } from "./types"

const cursorSchema = z.object({ id: z.string().uuid(), startsAt: z.string().datetime({ offset: true }) })
export async function getMemberMinistryDetails(identifier: string, cursorInput?: string | null): Promise<MemberMinistryDetails> {
  const access = await resolveMinistryAccess(identifier)
  let cursor = null
  if (cursorInput) { try { cursor = cursorSchema.parse(JSON.parse(cursorInput)) } catch { throw badRequest("Página inválida") } }
  const sql = getSql()
  const [ministries, activities, resources] = await Promise.all([
    sql<{ id: string; name: string; description: string; contact: string; leader_name: string | null; meeting_day: number | null; meeting_time: string | null; meeting_location: string }[]>`
      select m.id,m.name,m.description,m.contact,p.full_name as leader_name,m.meeting_day,m.meeting_time::text,m.meeting_location
      from public.ministries m left join public.people p on p.id=m.leader_person_id and p.company_id=${access.companyId} and p.deleted_at is null
      where m.id=${access.ministryId} and m.company_id=${access.companyId} and m.is_active and m.deleted_at is null`,
    sql<{ id: string; title: string; description: string; starts_at: Date; ends_at: Date | null; location: string; recurring: boolean; scale: MemberMinistryActivity["scale"] }[]>`
      select e.id,e.title,e.description,e.starts_at,e.ends_at,e.location,e.recurring,
        coalesce((select jsonb_agg(jsonb_build_object('id',s.id::text||':'||coalesce(a.id::text,'vacant'),
          'assignmentId',a.id,'role',s.role_name,'instructions',coalesce(nullif(s.instructions,''),pos.instructions,''),
          'startsAt',s.starts_at,'endsAt',s.ends_at,'personName',person.full_name,'status',a.status,
          'isMine',coalesce(v.person_id=${access.personId},false),'declineReason',case when v.person_id=${access.personId} then a.decline_reason else null end,
          'canDecline',coalesce(v.person_id=${access.personId} and s.starts_at>now() and a.status in ('notified','confirmed'),false)
        ) order by s.starts_at,s.role_name,person.full_name)
        from public.volunteer_shifts s join public.volunteer_schedules schedule on schedule.id=s.schedule_id and schedule.company_id=${access.companyId}
        left join public.volunteer_event_positions pos on pos.id=s.event_position_id and pos.company_id=${access.companyId}
        left join public.volunteer_assignments a on a.shift_id=s.id and a.company_id=${access.companyId} and a.status <> 'cancelled'
        left join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=${access.companyId}
        left join public.people person on person.id=v.person_id and person.company_id=${access.companyId} and person.deleted_at is null
        where s.event_id=e.id and s.company_id=${access.companyId} and (e.volunteer_schedule_published_at is not null or schedule.status='published')),'[]'::jsonb) as scale
      from public.events e where e.company_id=${access.companyId} and e.ministry_id=${access.ministryId} and e.deleted_at is null
        and e.status not in ('draft','canceled','cancelled') and coalesce(e.ends_at,e.starts_at+interval '2 hours')>=now()
        and (${cursor?.id ?? null}::uuid is null or (e.starts_at,e.id)>(${cursor?.startsAt ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
      order by e.starts_at,e.id limit 21`,
    sql<{ id: string; title: string; description: string; category: string; external_url: string | null; file_name: string | null; file_storage_path: string | null; mime_type: string | null }[]>`
      select resource.id,resource.title,resource.description,resource.category,resource.external_url,
        file.original_name as file_name,file.storage_path as file_storage_path,file.mime_type
      from public.ministry_resources resource
      left join public.app_files file on file.id=resource.file_id and file.company_id=${access.companyId} and file.is_active and file.deleted_at is null
      where resource.company_id=${access.companyId} and resource.ministry_id=${access.ministryId} and resource.deleted_at is null
        and (resource.visibility in ('members','public') or ${access.canManage})
      order by resource.sort_order,resource.title,resource.id`,
  ])
  if (!ministries[0]) throw badRequest("Ministério indisponível")
  const m = ministries[0]
  const items = activities.slice(0,20).map(e => ({ id: e.id, title: e.title, description: e.description, startsAt: new Date(e.starts_at).toISOString(), endsAt: e.ends_at ? new Date(e.ends_at).toISOString() : null, location: e.location, recurring: Boolean(e.recurring), scale: e.scale ?? [] }))
  const last = items.at(-1)
  const urls = await createSignedUrlsByStoragePath(resources.flatMap(resource => resource.file_storage_path ? [resource.file_storage_path] : []))
  return { id: m.id, name: m.name, description: m.description, contact: m.contact, leaderName: m.leader_name, meetingDay: m.meeting_day, meetingTime: m.meeting_time, meetingLocation: m.meeting_location,
    resources: resources.map(resource => ({ id: resource.id, title: resource.title, description: resource.description, category: resource.category, externalUrl: resource.external_url, fileName: resource.file_name, mimeType: resource.mime_type, fileUrl: resource.file_storage_path ? urls.get(resource.file_storage_path) ?? null : null })),
    activities: items, nextCursor: activities.length>20 && last ? JSON.stringify({ id: last.id, startsAt: last.startsAt }) : null }
}
