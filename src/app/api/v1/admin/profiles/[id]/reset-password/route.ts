import { fromActionResult } from "@/lib/api/action"
import { requireApiSuperadmin } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"
import { sendProfilePasswordReset } from "@/lib/admin/actions"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    await requireApiSuperadmin()
    const { id } = await context.params
    const result = await sendProfilePasswordReset(id)
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
