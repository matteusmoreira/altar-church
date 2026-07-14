import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { listFormSubmissions, listFormSubmissionsForCompany } from "@/lib/forms/data"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: formId } = await context.params
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const page = Number(request.nextUrl.searchParams.get("page") ?? "1")
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "20")

    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "forms:read",
      permission: "forms.view",
    })

    const result =
      auth.authType === "api_key"
        ? await listFormSubmissionsForCompany(auth.companyId, formId, { page, pageSize })
        : await listFormSubmissions(formId, auth.companyId, { page, pageSize })

    if (!result) throw notFound("Formulário não encontrado")
    return jsonOk(result.items, { meta: result.meta })
  } catch (error) {
    return jsonError(error)
  }
}
