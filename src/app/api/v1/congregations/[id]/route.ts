import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { deleteCongregation, saveCongregation } from "@/lib/congregations/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await saveCongregation({ ...body, id } as Parameters<typeof saveCongregation>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get("companyId")
    const result = await deleteCongregation({ id, companyId })
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
