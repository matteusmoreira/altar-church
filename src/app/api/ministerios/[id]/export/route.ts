import type { NextRequest } from "next/server"
import { z } from "zod"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"
import { xlsResponse } from "@/lib/export/xls"
import { getMinistryWorkspaceData } from "@/lib/ministries/data"
import { resolveMinistryAccess } from "@/lib/ministries/access"

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const ministryId = z.string().uuid().parse(id)
    const format = request.nextUrl.searchParams.get("format") === "xls" ? "xls" : "csv"
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "ministries.reports.view")
    await resolveMinistryAccess(ministryId, companyId)
    const data = await getMinistryWorkspaceData(ministryId, companyId)
    const rows: CsvCell[][] = [
      ["Ministério", "Campo", "Valor"],
      [data.workspace.profile.name, "Membros ativos", data.report.retention.currentActive],
      [data.workspace.profile.name, "Retenção 30 dias", `${data.report.retention.rate}%`],
      [data.workspace.profile.name, "Horas voluntárias", data.report.volunteerHours],
      [data.workspace.profile.name, "Escalas preenchidas", data.report.filledScales],
      [data.workspace.profile.name, "Follow-ups abertos", data.report.openFollowUps],
      [data.workspace.profile.name, "Follow-ups concluídos", data.report.completedFollowUps],
      [],
      ["Membros", "Nome", "Status", "Papel", "Equipes", "Contato"],
      ...data.members.map((member) => ["Membros", member.personName, member.status, member.role, member.teamNames.join(", "), member.email || member.phone]),
      [],
      ["Equipes", "Nome", "Líder", "Membros", "Vagas", "Ativa"],
      ...data.teams.map((team) => ["Equipes", team.name, team.leaderName ?? "", team.memberCount, team.openSlots, team.isActive ? "Sim" : "Não"]),
      [],
      ["Presença", "Status", "Total"],
      ...data.report.attendance.map((item) => ["Presença", item.status, item.total]),
      [],
      ["Onboarding", "Pessoa", "Checklist", "Concluído", "Total", "Progresso"],
      ...data.onboarding.map((item) => ["Onboarding", item.personName, item.templateName ?? "", item.completed, item.total, `${item.percent}%`]),
      [],
      ["Follow-up", "Pessoa", "Título", "Status", "Prioridade", "Prazo"],
      ...data.followUps.map((item) => ["Follow-up", item.personName, item.title, item.status, item.priority, item.dueAt ?? ""]),
      [],
      ["Comunicação", "Status", "Total"],
      ...data.report.communication.map((item) => ["Comunicação", item.status, item.total]),
    ]
    await auditExport("ministries.reports.export", "ministries", companyId, format)
    return format === "xls" ? xlsResponse(`ministerio-${stamp()}.xls`, rows) : csvResponse(`ministerio-${stamp()}.csv`, rows)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
