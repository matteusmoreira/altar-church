import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getPublicChurchData } from "@/lib/content/data"

type RouteContext = { params: Promise<{ slug: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params
    const data = await getPublicChurchData(slug)
    if (!data) {
      throw notFound("Igreja não encontrada")
    }
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
