import type { NextRequest } from "next/server"
import { fromActionResult } from "@/lib/api/action"
import { requireApiCompany } from "@/lib/api/auth"
import { objectToFormData } from "@/lib/api/form-data"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveReadingPlan } from "@/lib/operational/actions"
import { listReadingPlans } from "@/lib/operational/data"

export async function GET(request: NextRequest) {
  try {
    const companyId =
      request.nextUrl.searchParams.get("companyId")?.trim() || null
    const { companyId: resolved } = await requireApiCompany(companyId)
    const data = await listReadingPlans(resolved)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const result = await saveReadingPlan(objectToFormData(body))
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
