import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveGroupMember } from "@/lib/groups/actions"
import { listGroupMembers } from "@/lib/groups/data"

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await requireApiListContext(request, "groups.view")
    const data = await listGroupMembers(companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveGroupMember(body as Parameters<typeof saveGroupMember>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
