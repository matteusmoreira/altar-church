import { fromActionResult } from "@/lib/api/action"
import { requireApiPermission } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { getVolunteerDashboardData } from "@/lib/volunteers/data"
import { saveVolunteerModuleSettings } from "@/lib/volunteers/v2-actions"
export async function GET() {
  try { const { companyId } = await requireApiPermission("volunteer_settings.manage"); return jsonOk((await getVolunteerDashboardData(companyId)).settings) }
  catch (error) { return jsonError(error) }
}
export async function PUT(request: Request) {
  try { return fromActionResult(await saveVolunteerModuleSettings(await parseJsonBody(request) as Parameters<typeof saveVolunteerModuleSettings>[0])) }
  catch (error) { return jsonError(error) }
}

