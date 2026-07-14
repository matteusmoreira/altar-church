import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getOptionalBoolean, getPageParams, getSearchParam, parseJsonBody } from "@/lib/api/parse"
import { saveGroup } from "@/lib/groups/actions"
import { listGroups } from "@/lib/groups/data"
import type { GroupType } from "@/lib/groups/types"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "groups.view")
    const { page, pageSize } = getPageParams(request)
    const type = getSearchParam(request, "type") as GroupType | "all" | undefined
    const data = await listGroups({
      companyId,
      page,
      pageSize,
      search: getSearchParam(request, "q") ?? getSearchParam(request, "search"),
      categoryId: getSearchParam(request, "categoryId") ?? "all",
      type: type ?? "all",
      isActive: getOptionalBoolean(request, "isActive"),
      meetingDay: getSearchParam(request, "meetingDay") ?? "all",
    })
    return jsonOk(data.groups, {
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
    const result = await saveGroup(body as Parameters<typeof saveGroup>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
