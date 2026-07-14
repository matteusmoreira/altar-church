import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveContentBanner } from "@/lib/content/actions"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await saveContentBanner(body as Parameters<typeof saveContentBanner>[0])
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
