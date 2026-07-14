import { badRequest } from "@/lib/api/errors"
import { jsonOk } from "@/lib/api/http"

export type ActionResultLike = {
  ok: boolean
  id?: string
  error?: string
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
  return jsonOk(data, { status: options?.successStatus ?? 200 })
}
