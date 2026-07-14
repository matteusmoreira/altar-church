import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getOptionalBoolean, getPageParams, getSearchParam, parseJsonBody } from "@/lib/api/parse"
import { saveProgramming } from "@/lib/pastoral/actions"
import { listProgrammings } from "@/lib/pastoral/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "ministries.view")
    const { page, pageSize } = getPageParams(request)
    const data = await listProgrammings({
      companyId,
      page,
      pageSize,
      search: getSearchParam(request, "q") ?? getSearchParam(request, "search"),
      isActive: getOptionalBoolean(request, "isActive"),
    })
    return jsonOk(data.items, {
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
    const result = await saveProgramming(body as Parameters<typeof saveProgramming>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
