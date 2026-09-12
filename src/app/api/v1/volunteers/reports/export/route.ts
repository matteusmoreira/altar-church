import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"
import { type CsvCell, toCsv } from "@/lib/export/csv"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "volunteer_reports.export")
    const data = await getVolunteerDashboardData(companyId)
    const lines = [["Departamento", "Vagas", "Preenchidas", "Cobertura"], ...data.reports.departmentCoverage.map((row) => [row.departmentName, row.required, row.filled, row.required ? `${Math.round(row.filled * 100 / row.required)}%` : "100%"])]
    const csv = `\uFEFF${toCsv(lines as CsvCell[][])}`
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=voluntariado-relatorio.csv" } })
  } catch (error) { return jsonError(error) }
}
