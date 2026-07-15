import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getOptionalBoolean, getPageParams, getSearchParam, parseJsonBody } from "@/lib/api/parse"
import { saveGroup } from "@/lib/groups/actions"
import { listGroups } from "@/lib/groups/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "cells.view")
    const { page, pageSize } = getPageParams(request)
    const data = await listGroups({ companyId, page, pageSize, type: "cell", search: getSearchParam(request, "q") ?? getSearchParam(request, "search"), isActive: getOptionalBoolean(request, "isActive") })
    return jsonOk(data.groups, { meta: { total: data.total, page: data.page, pageSize: data.pageSize, pageCount: data.pageCount } })
  } catch (error) { return jsonError(error) }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request)
    return fromActionResult(await saveGroup({ ...(body as object), type: "cell" } as Parameters<typeof saveGroup>[0]), { successStatus: 201 })
  } catch (error) { return jsonError(error) }
}
