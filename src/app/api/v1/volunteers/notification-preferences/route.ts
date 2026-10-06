import { requireApiUser } from "@/lib/api/auth"
import { jsonError } from "@/lib/api/http"

async function removedPreferences() {
  try {
    await requireApiUser()
    return Response.json({ error: "Os avisos de escala são exibidos no painel do membro e não exigem configuração." }, { status: 410 })
  } catch (error) { return jsonError(error) }
}

export const GET = removedPreferences
export const PUT = removedPreferences
