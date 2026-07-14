import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { invitePersonAccess } from "@/lib/people/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await invitePersonAccess({
      ...body,
      personId: id,
    } as Parameters<typeof invitePersonAccess>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
