import type { NextRequest } from "next/server"
import { getContentDashboardData } from "@/lib/content/data"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"
import { getGroupsDashboardData, listGroupMeetingReports, listGroups } from "@/lib/groups/data"
import { getPeopleDashboardData, listPeople } from "@/lib/people/data"

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "reports.export")
    const [people, visitors, members, groups, cells, meetings, content] = await Promise.all([
      getPeopleDashboardData(companyId),
      listPeople({ companyId, personType: "visitor", pageSize: 500 }),
      listPeople({ companyId, personType: "member", pageSize: 500 }),
      getGroupsDashboardData(companyId),
      listGroups({ companyId, type: "cell", pageSize: 500 }),
      listGroupMeetingReports(companyId),
      getContentDashboardData(companyId),
    ])

    const rows: CsvCell[][] = [
      ["Seção", "Indicador", "Valor"],
      ["Pessoas", "Total", people.total],
      ["Pessoas", "Ativas", people.active],
      ["Pessoas", "Visitantes", people.visitors],
      ["Pessoas", "Batizadas", people.baptized],
      ["Pessoas", "Duplicidades possíveis", people.possibleDuplicates],
      ["Visitantes", "Em acompanhamento", visitors.people.filter((person) => ["new", "contacted", "following"].includes(person.journeyStatus)).length],
      ["Visitantes", "Convertidos", visitors.people.filter((person) => person.journeyStatus === "converted").length],
      ["Grupos", "Total", groups.total],
      ["Grupos", "Ativos", groups.active],
      ["Grupos", "Participantes", groups.members],
      ["Grupos", "Vagas livres", groups.openCapacity],
      ["Reuniões", "Total", meetings.length],
      ["Reuniões", "Reportadas", meetings.filter((meeting) => meeting.reportStatus === "reported").length],
      ["Reuniões", "Presentes reportados", meetings.reduce((sum, meeting) => sum + meeting.presentCount, 0)],
      ["Conteúdo", "Categorias", content.categories.length],
      ["Conteúdo", "Posts", content.posts.length],
      ["Conteúdo", "Posts publicados", content.posts.filter((post) => post.status === "published").length],
      ["Conteúdo", "Banners ativos", content.banners.filter((banner) => banner.isActive).length],
      [],
      ["Células", "Nome", "Líder", "Dia", "Membros", "Capacidade", "Ativa"],
      ...cells.groups.map((cell) => ["Células", cell.name, cell.leaderName ?? "", cell.meetingDay, cell.memberCount, cell.maxCapacity, cell.isActive ? "Sim" : "Não"]),
      [],
      ["Aniversariantes", "Nome", "Data", "Telefone"],
      ...members.people
        .filter((person) => person.birthDate && new Date(`${person.birthDate}T00:00:00`).getMonth() === new Date().getMonth())
        .map((person) => ["Aniversariantes", person.fullName, person.birthDate, person.phone]),
    ]

    await auditExport("reports.export", "reports", companyId)
    return csvResponse(`relatorios-${todayStamp()}.csv`, rows)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
