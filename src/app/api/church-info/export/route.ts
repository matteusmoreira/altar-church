import type { NextRequest } from "next/server"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { xlsResponse, type XlsCell } from "@/lib/export/xls"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"
import { getChurchInfoData } from "@/lib/church-info/data"

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function safeFileSlug(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "igreja"
  )
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "settings.edit")
    const format = (request.nextUrl.searchParams.get("format") ?? "xlsx").toLowerCase()
    const data = await getChurchInfoData(companyId)

    const rows: (string | number | boolean | null | undefined)[][] = [
      ["DADOS INSTITUCIONAIS DA IGREJA"],
      ["Nome da Igreja (Razão Social)", data.profile.companyName],
      ["Nome Público", data.profile.publicName],
      ["Responsável / Pastor", data.profile.responsibleName],
      ["E-mail Institucional", data.profile.email],
      ["Telefone", data.profile.phone],
      ["Website", data.profile.website],
      ["Endereço", data.profile.address],
      ["Cidade", data.profile.city],
      ["Estado", data.profile.state],
      ["País", data.profile.country],
      ["Fuso Horário", data.profile.timezone],
      ["História / Sobre", data.profile.history],
      [],
      ["REDES SOCIAIS"],
      ["Plataforma", "URL", "Ativo"],
      ...data.socialLinks.map((social) => [
        social.platform,
        social.url || "-",
        social.isActive ? "Sim" : "Não",
      ]),
      [],
      ["CONGREGAÇÕES VINCULADAS"],
      ["Nome", "Endereço", "Responsável", "Status"],
      ...data.congregations.map((congregation) => [
        congregation.name,
        congregation.address || "-",
        congregation.responsible || "-",
        congregation.isActive ? "Ativo" : "Inativo",
      ]),
      [],
      ["MINISTÉRIOS CADASTRADOS"],
      ["Nome", "Líder", "Membros", "Status"],
      ...data.ministries.map((ministry) => [
        ministry.name,
        ministry.leaderName || "-",
        ministry.memberCount,
        ministry.isActive ? "Ativo" : "Inativo",
      ]),
      [],
      ["PROGRAMAÇÃO"],
      ["Título", "Data", "Ao Vivo", "Status"],
      ...data.programmings.map((prog) => [
        prog.title,
        prog.startsAt || "-",
        prog.isLive ? "Sim" : "Não",
        prog.isActive ? "Ativo" : "Inativo",
      ]),
    ]

    await auditExport("church-info.export", "church_profiles", companyId, format)

    const filename = `igreja-${safeFileSlug(data.profile.publicName)}-${todayStamp()}`

    if (format === "csv") {
      return csvResponse(`${filename}.csv`, rows as CsvCell[][])
    }

    return xlsResponse(`${filename}.xls`, rows as XlsCell[][])
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
