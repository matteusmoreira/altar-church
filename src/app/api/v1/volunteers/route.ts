import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteer } from "@/lib/volunteers/actions"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "volunteers.view")
    const dashboard = await getVolunteerDashboardData(companyId)
    const search = request.nextUrl.searchParams.get("search")?.trim().toLocaleLowerCase("pt-BR") ?? ""
    const status = request.nextUrl.searchParams.get("status")
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 25)))
    const filtered = dashboard.volunteers.filter((volunteer) => (!search || `${volunteer.name} ${volunteer.email ?? ""} ${volunteer.phone}`.toLocaleLowerCase("pt-BR").includes(search))
      && (!status || volunteer.status === status))
    const items = filtered.slice((page - 1) * pageSize, page * pageSize)
    return jsonOk(items, { meta: { total: filtered.length, page, pageSize, pageCount: Math.ceil(filtered.length / pageSize) } })
  } catch (error) { return jsonError(error) }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveVolunteer(body as Parameters<typeof saveVolunteer>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
