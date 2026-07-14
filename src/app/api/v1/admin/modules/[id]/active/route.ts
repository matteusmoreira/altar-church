import { fromActionResult } from "@/lib/api/action"
import { requireApiSuperadmin } from "@/lib/api/auth"
import { badRequest } from "@/lib/api/errors"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { setModuleActive } from "@/lib/admin/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiSuperadmin()
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as { active?: boolean }
    if (typeof body.active !== "boolean") {
      throw badRequest("Campo active (boolean) obrigatório")
    }
    const result = await setModuleActive(id, body.active)
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
