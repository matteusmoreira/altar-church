import { requireApiUser } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"

async function removedAvailability() {
  try {
    await requireApiUser()
    return Response.json({ error: "A configuração de disponibilidade foi removida. As escalas são definidas pelo responsável." }, { status: 410 })
  } catch (error) { return jsonError(error) }
}

export const GET = removedAvailability
export const PUT = removedAvailability
