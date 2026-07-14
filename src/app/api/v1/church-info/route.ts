import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveChurchInfo } from "@/lib/church-info/actions"
import { getChurchInfoData } from "@/lib/church-info/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "settings.edit")
    const data = await getChurchInfoData(companyId)
    return jsonOk(data)
  } catch (error) {
    // settings.edit may be too strict for view — fall back via data layer permissions
    return jsonError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveChurchInfo(body as Parameters<typeof saveChurchInfo>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
