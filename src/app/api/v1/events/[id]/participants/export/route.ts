import type { NextRequest } from "next/server"
import { requireExportContext, auditExport, toExportErrorResponse } from "@/lib/export/server"
import { xlsResponse, type XlsCell } from "@/lib/export/xls"
import { getSql } from "@/lib/db/client"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "reports.export")
    const eventRows = await getSql()<{ title: string }[]>`
      select title from public.events where id = ${id} and company_id = ${companyId} and deleted_at is null limit 1
    `
    if (!eventRows[0]) return Response.json({ error: "Evento não encontrado" }, { status: 404 })
    const rows = await getSql()<{
      kind: string; name: string; email: string; phone: string; status: string; checked_in: boolean; created_at: Date | string
    }[]>`
      select 'Membro' as kind, person.full_name as name, coalesce(person.email, '') as email, person.phone,
        rsvp.status, exists(select 1 from public.attendance_records attendance where attendance.company_id = rsvp.company_id and attendance.event_ref_id = rsvp.event_id and attendance.event_type = 'event' and attendance.person_id = rsvp.person_id and attendance.status = 'present' and attendance.deleted_at is null) as checked_in,
        rsvp.created_at
      from public.member_event_rsvps rsvp join public.people person on person.id = rsvp.person_id and person.company_id = rsvp.company_id
      where rsvp.company_id = ${companyId} and rsvp.event_id = ${id}
      union all
      select 'Visitante' as kind, guest.full_name as name, guest.email, guest.phone, guest.status,
        guest.checked_in_at is not null as checked_in, guest.created_at
      from public.event_guest_registrations guest
      where guest.company_id = ${companyId} and guest.event_id = ${id}
      order by name
    `
    const cells: XlsCell[][] = [
      ["Evento", eventRows[0].title],
      [],
      ["Tipo", "Nome", "E-mail", "Telefone", "Status", "Presença", "Inscrito em"],
      ...rows.map((row) => [row.kind, row.name, row.email, row.phone, row.status, row.checked_in ? "Presente" : "Pendente", new Date(row.created_at).toLocaleString("pt-BR")] as XlsCell[]),
    ]
    await auditExport("events.participants.export", "member_event_rsvps", companyId, "xls")
    const safeTitle = eventRows[0].title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "evento"
    return xlsResponse(`participantes-${safeTitle}.xls`, cells)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
