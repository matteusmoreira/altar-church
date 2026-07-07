import type { NextRequest } from "next/server"
import { csvResponse, type CsvCell } from "@/lib/export/csv"
import { auditExport, requireExportContext, toExportErrorResponse } from "@/lib/export/server"
import { getDonationData } from "@/lib/operational/data"

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireExportContext(request.nextUrl.searchParams, "donation.export")
    const { donations, recurrences } = await getDonationData(companyId)

    const rows: CsvCell[][] = [
      ["Tipo", "Data", "Doador", "Motivo", "Método", "Valor", "Status"],
      ...donations.map((donation) => [
        "Doação",
        donation.date,
        donation.donorName,
        donation.reason,
        donation.method,
        donation.amount,
        donation.status,
      ]),
      [],
      ["Tipo", "Doador", "Motivo", "Frequência", "Valor", "Ativo", "Pendente"],
      ...recurrences.map((recurrence) => [
        "Recorrência",
        recurrence.userName,
        recurrence.reason,
        recurrence.frequency,
        recurrence.amount,
        recurrence.active ? "Sim" : "Não",
        recurrence.pending ? "Sim" : "Não",
      ]),
    ]

    await auditExport("donation.export", "donations", companyId)
    return csvResponse(`doacoes-${todayStamp()}.csv`, rows)
  } catch (error) {
    return toExportErrorResponse(error)
  }
}
