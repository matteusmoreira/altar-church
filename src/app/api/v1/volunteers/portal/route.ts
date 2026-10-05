import { requireApiUser } from "@/lib/api/auth"
import { forbidden } from "@/lib/api/errors"
import { getVolunteerSelfContext } from "@/lib/volunteers/access"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getVolunteerPortalData } from "@/lib/volunteers/data"

export async function GET() {
  try {
    await requireApiUser()
    if (!await getVolunteerSelfContext()) throw forbidden("Perfil de voluntário ativo não vinculado")
    const data = await getVolunteerPortalData()
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}
