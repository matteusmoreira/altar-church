import type { NextRequest } from "next/server"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getPersonFormOptions } from "@/lib/people/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "members.view")
    const data = await getPersonFormOptions(companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
