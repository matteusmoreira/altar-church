"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { getSql } from "@/lib/db/client"
import { resolveVolunteerContext } from "@/lib/volunteers/access"
import { toUserFriendlyError } from "@/lib/errors/user-friendly-error"

const schema = z.object({ assignmentId: z.string().uuid(), reason: z.string().trim().max(500).default("") })
export async function declineMyPublishedAssignment(input: z.input<typeof schema>) {
  try {
    const parsed = schema.parse(input)
    const context = await resolveVolunteerContext()
    if (!context) throw new Error("Conta sem identidade ativa vinculada")
    const { user, companyId, personId } = context
    await getSql().begin(async tx => {
      // Match the leader's lock order: shift first, then assignment.
      await tx`select s.id from public.volunteer_shifts s join public.volunteer_assignments a on a.shift_id=s.id and a.company_id=${companyId}
        join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=${companyId} and v.person_id=${personId}
        where a.id=${parsed.assignmentId} and s.company_id=${companyId} for update of s`
      await tx`select e.id from public.events e join public.volunteer_shifts s on s.event_id=e.id and s.company_id=${companyId}
        join public.volunteer_assignments a on a.shift_id=s.id and a.company_id=${companyId} where a.id=${parsed.assignmentId} and e.company_id=${companyId} for share of e`
      const rows = await tx<{ id: string; status: string; ministry_id: string | null; published: boolean; future: boolean }[]>`
        select a.id,a.status,e.ministry_id,
          (schedule.status='published' or e.volunteer_schedule_published_at is not null) as published,
          s.starts_at > now() as future
        from public.volunteer_assignments a
        join public.volunteer_profiles v on v.id=a.volunteer_id and v.company_id=${companyId} and v.person_id=${personId} and v.deleted_at is null and v.registration_status='active'
        join public.people person on person.id=v.person_id and person.company_id=${companyId} and person.is_active and person.deleted_at is null and person.status <> 'inactive'
        join public.volunteer_shifts s on s.id=a.shift_id and s.company_id=${companyId}
        join public.volunteer_schedules schedule on schedule.id=s.schedule_id and schedule.company_id=${companyId}
        left join public.events e on e.id=s.event_id and e.company_id=${companyId}
        where a.id=${parsed.assignmentId} and a.company_id=${companyId}
          and (s.event_id is null or (e.id is not null and e.deleted_at is null and e.status not in ('draft','canceled','cancelled')))
        for update of a,s`
      const assignment = rows[0]
      if (!assignment || !assignment.published) throw new Error("Escala publicada não encontrada")
      if (assignment.ministry_id) {
        const memberships = await tx`select id from public.ministry_memberships where company_id=${companyId} and ministry_id=${assignment.ministry_id} and person_id=${personId} and status='active' and left_at is null for share`
        if (!memberships.length) throw new Error("Você não participa mais deste ministério")
      }
      // A repeated submit preserves the original reason and does not emit another event.
      if (assignment.status === "declined") return
      if (!assignment.future || !["notified", "confirmed"].includes(assignment.status)) throw new Error("Não é possível avisar ausência nesta escala")
      await tx`update public.volunteer_assignments set status='declined',decline_reason=${parsed.reason || null},responded_at=now(),updated_at=now(),updated_by=${user.id} where id=${assignment.id} and company_id=${companyId}`
      await tx`insert into public.audit_logs(company_id,actor_profile_id,action,entity_table,entity_id,metadata)
        values(${companyId},${user.id},'volunteer_assignment.declined','volunteer_assignments',${assignment.id},'{}'::jsonb)`
    })
    for (const path of ["/membro", "/membro/agenda", "/membro/ministerios", "/membro/voluntariado", "/ministerios", "/voluntariado"]) revalidatePath(path, "layout")
    return { ok: true, id: parsed.assignmentId }
  } catch (error) { return { ok: false, error: error instanceof z.ZodError ? error.issues[0]?.message : toUserFriendlyError(error, "Não foi possível avisar a ausência") } }
}
