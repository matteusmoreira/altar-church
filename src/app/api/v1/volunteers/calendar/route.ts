import { jsonError } from "@/lib/api/http"
import { getVolunteerPortalData } from "@/lib/volunteers/data"
const esc = (value: string) => value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n")
const date = (value: string) => new Date(value).toISOString().replaceAll(/[-:]/g, "").replace(".000", "")
export async function GET() {
  try {
    const data = await getVolunteerPortalData()
    const events = data.upcomingAssignments.map((shift) => ["BEGIN:VEVENT", `UID:${shift.id}@altarchurch`, `DTSTAMP:${date(new Date().toISOString())}`, `DTSTART:${date(shift.startsAt)}`, `DTEND:${date(shift.endsAt ?? shift.startsAt)}`, `SUMMARY:${esc(`${shift.eventTitle} — ${shift.roleName}`)}`, `DESCRIPTION:${esc(shift.instructions)}`, "END:VEVENT"].join("\r\n"))
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Altar Church//Voluntariado//PT-BR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n")
    return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": "attachment; filename=minha-escala.ics" } })
  } catch (error) { return jsonError(error) }
}

