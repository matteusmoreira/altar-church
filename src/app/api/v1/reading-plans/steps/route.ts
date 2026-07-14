import { fromActionResult } from "@/lib/api/action"
import { objectToFormData } from "@/lib/api/form-data"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveReadingPlanStep } from "@/lib/operational/actions"

export async function POST(request: Request) {
  try {
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await saveReadingPlanStep(objectToFormData(body))
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
