import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { deletePerson, savePerson } from "@/lib/people/actions"
import { getPersonDetail } from "@/lib/people/data"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const { companyId } = await requireApiListContext(request, "members.view")
    const person = await getPersonDetail(id, companyId)
    if (!person) {
      throw notFound("Pessoa não encontrada")
    }
    return jsonOk(person)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await savePerson({ ...body, id } as Parameters<typeof savePerson>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const companyId = request.nextUrl.searchParams.get("companyId")
    const result = await deletePerson({ id, companyId })
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
