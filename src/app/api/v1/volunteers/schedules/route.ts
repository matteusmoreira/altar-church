import { fromActionResult } from "@/lib/api/action"
import { jsonError } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { generateMonthlyVolunteerSchedule } from "@/lib/volunteers/actions"

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request)
    const result = await generateMonthlyVolunteerSchedule(
      body as Parameters<typeof generateMonthlyVolunteerSchedule>[0],
    )
    return fromActionResult(result, { successStatus: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
