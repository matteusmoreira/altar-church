import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"
const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`
export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "volunteer_reports.export")
    const data = await getVolunteerDashboardData(companyId)
    const lines = [["Departamento", "Vagas", "Preenchidas", "Cobertura"], ...data.reports.departmentCoverage.map((row) => [row.departmentName, row.required, row.filled, row.required ? `${Math.round(row.filled * 100 / row.required)}%` : "100%"])]
    const csv = `\uFEFF${lines.map((line) => line.map(cell).join(";")).join("\r\n")}`
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=voluntariado-relatorio.csv" } })
  } catch (error) { return jsonError(error) }
}

