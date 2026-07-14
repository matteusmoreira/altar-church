import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { removeGroupMember } from "@/lib/groups/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get("companyId")
    const result = await removeGroupMember({ id, companyId })
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
