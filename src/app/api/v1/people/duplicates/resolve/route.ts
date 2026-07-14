import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { resolveDuplicateCandidate } from "@/lib/people/actions"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await resolveDuplicateCandidate(body as Parameters<typeof resolveDuplicateCandidate>[0])
    return fromActionResult(result)
  } catch (error) {
    return jsonError(error)
  }
}
