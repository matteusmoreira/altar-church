import type { NextRequest } from "next/server"
import { fromActionResult, type ActionResultLike } from "@/lib/api/action"
import { requireApiListContext } from "@/lib/api/auth"
import { objectToFormData } from "@/lib/api/form-data"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import type { Permission } from "@/lib/types"

type ListFn<T> = (companyId?: string | null) => Promise<T>
type FormAction = (formData: FormData) => Promise<ActionResultLike>

export function createOperationalListHandler<T>(permission: Permission, listFn: ListFn<T>) {
  return async function GET(request: NextRequest) {
    try {
      const { companyId } = await requireApiListContext(request, permission)
      const data = await listFn(companyId)
      return jsonOk(data)
    } catch (error) {
      return jsonError(error)
    }
  }
}

export function createFormActionPostHandler(action: FormAction, successStatus = 201) {
  return async function POST(request: Request) {
    try {
      const body = (await parseJsonBody(request)) as Record<string, unknown>
      const result = await action(objectToFormData(body))
      return fromActionResult(result, { successStatus })
    } catch (error) {
      return jsonError(error)
    }
  }
}

export function createFormActionDeleteHandler(action: FormAction, idField = "id") {
  return async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await context.params
      const companyId = request.nextUrl.searchParams.get("companyId")
      const payload: Record<string, unknown> = { [idField]: id }
      if (companyId) payload.companyId = companyId
      const result = await action(objectToFormData(payload))
      return fromActionResult(result)
    } catch (error) {
      return jsonError(error)
    }
  }
}

export function createFormActionPatchHandler(action: FormAction, idField = "id") {
  return async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
      const { id } = await context.params
      const body = (await parseJsonBody(request)) as Record<string, unknown>
      const result = await action(objectToFormData({ ...body, [idField]: id }))
      return fromActionResult(result)
    } catch (error) {
      return jsonError(error)
    }
  }
}
