import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { fromActionResult } from "@/lib/api/action"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getOptionalBoolean, getPageParams, getSearchParam, parseJsonBody } from "@/lib/api/parse"
import { savePerson } from "@/lib/people/actions"
import { listPeople } from "@/lib/people/data"
import type { PeopleListFilters } from "@/lib/people/types"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "members.view")
    const { page, pageSize } = getPageParams(request)
    const filters: PeopleListFilters = {
      companyId,
      page,
      pageSize,
      search: getSearchParam(request, "q") ?? getSearchParam(request, "search"),
      status: getSearchParam(request, "status") as PeopleListFilters["status"],
      personType: getSearchParam(request, "personType") as PeopleListFilters["personType"],
      congregationId: getSearchParam(request, "congregationId"),
      baptized: getOptionalBoolean(request, "baptized"),
      emailValidated: getOptionalBoolean(request, "emailValidated"),
      isActive: getOptionalBoolean(request, "isActive"),
    }
    const data = await listPeople(filters)
    return jsonOk(data.people, {
      meta: {
        total: data.total,
        page: data.page,
        pageSize: data.pageSize,
        pageCount: data.pageCount,
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request)
    const result = await savePerson(body as Parameters<typeof savePerson>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
