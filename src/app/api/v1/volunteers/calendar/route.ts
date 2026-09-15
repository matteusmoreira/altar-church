import type { NextRequest } from "next/server"
import { getCurrentUser, requireUserCompanyId } from "@/lib/auth/server"
import { getSql } from "@/lib/db/client"
import { jsonError } from "@/lib/api/http"
import { unauthorized } from "@/lib/api/errors"
import { getVolunteerSelfContext } from "@/lib/volunteers/access"

const esc = (value?: string | null) => {
  if (!value) return ""
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .trim()
}

const date = (value?: string | Date | null, fallback?: Date) => {
  try {
    const d = value ? new Date(value) : (fallback ?? new Date())
    if (isNaN(d.getTime())) {
      return (fallback ?? new Date()).toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")
    }
    return d.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")
  } catch {
    return new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "")
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return jsonError(unauthorized("Faça login para acessar o calendário"))
    }
    const companyId = requireUserCompanyId(user)
    const sql = getSql()
    const scope = request.nextUrl.searchParams.get("scope")

    const selfContext = await getVolunteerSelfContext()
    const isManager = ["superadmin", "admin", "pastor", "ministry_leader", "cell_supervisor"].includes(user.role)
    const wantsChurch = scope === "church" || (!scope && isManager && !selfContext)

    const nowIso = new Date().toISOString()
    let calendarName = "Voluntariado — Altar Church"
    let filename = "escala-voluntariado.ics"
    const eventBlocks: string[] = []

    if (wantsChurch) {
      calendarName = "Escalas da Igreja — Altar Church"
      filename = "escalas-voluntariado.ics"

      const shiftRows = await sql<Record<string, unknown>[]>`
        select shift.id, shift.schedule_id, shift.event_id,
               coalesce(event.title, 'Escala de Voluntariado') as event_title,
               shift.department_id, department.name as department_name,
               shift.role_name, shift.required_volunteers,
               shift.starts_at, shift.ends_at, shift.instructions,
               coalesce(string_agg(distinct person.full_name, ', ' order by person.full_name)
                 filter (where assignment.status not in ('declined', 'cancelled')), '') as assigned_volunteers
        from public.volunteer_shifts shift
        join public.volunteer_schedules schedule on schedule.id = shift.schedule_id
        join public.volunteer_departments department on department.id = shift.department_id
        left join public.events event on event.id = shift.event_id
        left join public.volunteer_assignments assignment on assignment.shift_id = shift.id
        left join public.volunteer_profiles vp on vp.id = assignment.volunteer_id
        left join public.people person on person.id = vp.person_id and person.deleted_at is null
        where shift.company_id = ${companyId}
          and shift.starts_at >= now() - interval '30 days'
          and shift.starts_at <= now() + interval '90 days'
        group by shift.id, event.title, department.name
        order by shift.starts_at, department.name, shift.role_name
        limit 200
      `

      for (const row of shiftRows) {
        const id = String(row.id)
        const title = `${String(row.event_title)} — ${String(row.department_name)}: ${String(row.role_name)}`
        const startsAt = row.starts_at as Date | string
        const endsAt = (row.ends_at as Date | string | null) ?? startsAt
        const assigned = String(row.assigned_volunteers ?? "").trim()
        const instructions = String(row.instructions ?? "").trim()
        const descriptionParts: string[] = [
          `Equipe: ${String(row.department_name)}`,
          `Função: ${String(row.role_name)}`,
          assigned ? `Voluntários: ${assigned}` : `Vagas: ${Number(row.required_volunteers ?? 1)} aberta(s)`,
        ]
        if (instructions) descriptionParts.push(`Instruções: ${instructions}`)

        eventBlocks.push(
          [
            "BEGIN:VEVENT",
            `UID:church-${id}@altarchurch`,
            `DTSTAMP:${date(nowIso)}`,
            `DTSTART:${date(startsAt)}`,
            `DTEND:${date(endsAt)}`,
            `SUMMARY:${esc(title)}`,
            `DESCRIPTION:${esc(descriptionParts.join("\n"))}`,
            "STATUS:CONFIRMED",
            "END:VEVENT",
          ].join("\r\n"),
        )
      }
    } else {
      calendarName = "Minha Escala — Altar Church"
      filename = "minha-escala.ics"

      if (selfContext) {
        const assignmentRows = await sql<Record<string, unknown>[]>`
          select shift.id, shift.event_id,
                 coalesce(event.title, 'Escala de Voluntário') as event_title,
                 shift.department_id, department.name as department_name,
                 shift.role_name, shift.starts_at, shift.ends_at, shift.instructions,
                 assignment.status as assignment_status
          from public.volunteer_assignments assignment
          join public.volunteer_shifts shift on shift.id = assignment.shift_id
          join public.volunteer_departments department on department.id = shift.department_id
          left join public.events event on event.id = shift.event_id
          where assignment.volunteer_id = ${selfContext.volunteerId}
            and assignment.status not in ('declined', 'cancelled')
            and shift.starts_at >= now() - interval '30 days'
            and shift.starts_at <= now() + interval '90 days'
          order by shift.starts_at
          limit 100
        `

        for (const row of assignmentRows) {
          const id = String(row.id)
          const title = `${String(row.event_title)} — ${String(row.role_name)} (${String(row.department_name)})`
          const startsAt = row.starts_at as Date | string
          const endsAt = (row.ends_at as Date | string | null) ?? startsAt
          const instructions = String(row.instructions ?? "").trim()
          const descriptionParts: string[] = [
            `Função: ${String(row.role_name)}`,
            `Equipe: ${String(row.department_name)}`,
          ]
          if (instructions) descriptionParts.push(`Instruções: ${instructions}`)

          eventBlocks.push(
            [
              "BEGIN:VEVENT",
              `UID:shift-${id}@altarchurch`,
              `DTSTAMP:${date(nowIso)}`,
              `DTSTART:${date(startsAt)}`,
              `DTEND:${date(endsAt)}`,
              `SUMMARY:${esc(title)}`,
              `DESCRIPTION:${esc(descriptionParts.join("\n"))}`,
              "STATUS:CONFIRMED",
              "END:VEVENT",
            ].join("\r\n"),
          )
        }
      }
    }

    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Altar Church//Voluntariado//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(calendarName)}`,
      "X-WR-TIMEZONE:America/Sao_Paulo",
      ...eventBlocks,
      "END:VCALENDAR",
    ].join("\r\n")

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-cache, no-store, must-revalidate",
        "pragma": "no-cache",
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}


