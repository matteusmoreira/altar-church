import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { deleteGroup, saveGroup } from "@/lib/groups/actions"
import { listGroups } from "@/lib/groups/data"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { companyId } = await requireApiListContext(request, "groups.view")
    const data = await listGroups({ companyId, page: 1, pageSize: 100, search: "" })
    const group = data.groups.find((item) => item.id === id)
    if (!group) {
      throw notFound("Grupo não encontrado")
    }
    return jsonOk(group)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await saveGroup({ ...body, id } as Parameters<typeof saveGroup>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get("companyId")
    const result = await deleteGroup({ id, companyId })
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
