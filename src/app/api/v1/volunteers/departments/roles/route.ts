import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveVolunteerDepartmentRole } from "@/lib/volunteers/v2-actions"
export async function POST(request: Request) {
  try { return fromActionResult(await saveVolunteerDepartmentRole(await parseJsonBody(request) as Parameters<typeof saveVolunteerDepartmentRole>[0]), { successStatus: 201 }) }
  catch (error) { return jsonError(error) }
}

