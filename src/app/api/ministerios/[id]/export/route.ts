import type { NextRequest } from "next/server"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { auditExport, ExportHttpError, toExportErrorResponse } from "@/lib/export/server"
import { xlsResponse } from "@/lib/export/xls"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"
import { getMinistryReport } from "@/lib/ministries/data"
import { requireMinistryPermission } from "@/lib/ministries/access"
import { getCurrentUser } from "@/lib/auth/server"
import { reportPeriodSchema } from "@/lib/ministries/management-contract"

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const format = request.nextUrl.searchParams.get("format") === "xls" ? "xls" : "csv"
    if (!await getCurrentUser()) throw new ExportHttpError("Não autenticado", 401)
    let access
    try { access = await requireMinistryPermission(id, "ministries.reports.view", request.nextUrl.searchParams.get("companyId")) }
    catch { throw new ExportHttpError("Acesso negado", 403) }
    const companyId = access.companyId
    const data = await getMinistryWorkspaceData(access.ministryId, companyId)
    const from = request.nextUrl.searchParams.get("from"), to = request.nextUrl.searchParams.get("to")
    if ((from && !to) || (!from && to)) throw new ExportHttpError("Informe início e fim", 400)
    let period
    try { period = from && to ? reportPeriodSchema.parse({ from, to }) : undefined }
    catch { throw new ExportHttpError("Período inválido", 400) }
    const report = await getMinistryReport(access.ministryId, companyId, period)
    const rows: CsvCell[][] = [
      ["Ministério", "Campo", "Valor"],
      [data.workspace.profile.name, "Período", `${report.period.from} a ${report.period.to} (${report.timezone})`],
      [data.workspace.profile.name, "Membros ativos", report.retention.currentActive],
      [data.workspace.profile.name, "Membros ativos há pelo menos 30 dias", `${report.retention.rate}%`],
      [data.workspace.profile.name, "Horas previstas na escala", report.volunteerHours],
      [data.workspace.profile.name, "Escalas preenchidas", report.filledScales],
      [data.workspace.profile.name, "Follow-ups abertos", report.openFollowUps],
      [data.workspace.profile.name, "Follow-ups concluídos", report.completedFollowUps],
      [],
      ["Membros", "Nome", "Status", "Papel", "Equipes", "Contato"],
      ...data.members.map((member) => ["Membros", member.personName, member.status, member.role, member.teamNames.join(", "), member.email || member.phone]),
      [],
      ["Equipes", "Nome", "Líder", "Membros", "Vagas", "Ativa"],
      ...data.teams.map((team) => ["Equipes", team.name, team.leaderName ?? "", team.memberCount, team.openSlots, team.isActive ? "Sim" : "Não"]),
      [],
      ["Presença", "Status", "Total"],
      ...report.attendance.map((item) => ["Presença", item.status, item.total]),
      [],
      ["Comunicação", "Status", "Total"],
      ...report.communication.map((item) => ["Comunicação", item.status, item.total]),
    ]
    await auditExport("ministries.reports.export", "ministries", companyId, format)
    return format === "xls" ? xlsResponse(`ministerio-${stamp()}.xls`, rows) : csvResponse(`ministerio-${stamp()}.csv`, rows)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
