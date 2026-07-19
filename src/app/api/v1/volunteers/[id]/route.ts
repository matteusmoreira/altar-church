import { fromActionResult } from "@/lib/api/action"
import { requireApiPermission } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteer } from "@/lib/volunteers/actions"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"
import { softDeleteVolunteer } from "@/lib/volunteers/v2-actions"

type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
  try {
    const { companyId } = await requireApiPermission("volunteers.view")
    const { id } = await context.params
    const volunteer = (await getVolunteerDashboardData(companyId)).volunteers.find((item) => item.id === id)
    if (!volunteer) throw new Error("Voluntário não encontrado")
    return jsonOk(volunteer)
  } catch (error) { return jsonError(error) }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params
    const body = await parseJsonBody(request) as Record<string, unknown>
    return fromActionResult(await saveVolunteer({ ...body, id } as Parameters<typeof saveVolunteer>[0]))
  } catch (error) { return jsonError(error) }
}
export async function DELETE(_request: Request, context: Context) {
  try { return fromActionResult(await softDeleteVolunteer((await context.params).id)) }
  catch (error) { return jsonError(error) }
}

