import { badRequest } from "@/lib/api/errors"
import { jsonOk } from "@/lib/api/http"

export type ActionResultLike = {
  ok: boolean
  id?: string
  error?: string
  data?: unknown
  qrToken?: string
}

export function fromActionResult(
  result: ActionResultLike,
  options?: { successStatus?: number },
) {
  if (!result.ok) {
    throw badRequest(result.error ?? "Operação falhou")
  }

  const data: Record<string, unknown> = {}
  if (result.id !== undefined) {
    data.id = result.id
  }
  if (result.data !== undefined) data.result = result.data
  if (result.qrToken !== undefined) data.qrToken = result.qrToken
  return jsonOk(data, { status: options?.successStatus ?? 200 })
}
