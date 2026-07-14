import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { getFormSubmissionById, getFormSubmissionForCompany } from "@/lib/forms/data"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "forms:read",
      permission: "forms.view",
    })

    const submission =
      auth.authType === "api_key"
        ? await getFormSubmissionForCompany(auth.companyId, id)
        : await getFormSubmissionById(id, auth.companyId)

    if (!submission) throw notFound("Envio não encontrado")
    return jsonOk(submission)
  } catch (error) {
    return jsonError(error)
  }
}
