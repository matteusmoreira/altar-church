import { fromActionResult } from "@/lib/api/action"
import { requireApiPermission } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"
import { saveVolunteerEventPlan } from "@/lib/volunteers/v2-actions"
type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
  try { const { companyId } = await requireApiPermission("volunteers.view"); const id = (await context.params).id; return jsonOk((await getVolunteerDashboardData(companyId)).eventPlans.find((item) => item.eventId === id) ?? null) }
  catch (error) { return jsonError(error) }
}
export async function PUT(request: Request, context: Context) {
  try { return fromActionResult(await saveVolunteerEventPlan({ ...(await parseJsonBody(request) as object), eventId: (await context.params).id } as Parameters<typeof saveVolunteerEventPlan>[0])) }
  catch (error) { return jsonError(error) }
}

