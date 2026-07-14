import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { saveForm } from "@/lib/forms/actions"
import { listFormsForApi, listFormsForCompany } from "@/lib/forms/data"

export async function GET(request: NextRequest) {
  try {
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    const auth = await requireApiAuth(request, {
      requestedCompanyId,
      scopes: "forms:read",
      permission: "forms.view",
    })

    if (auth.authType === "api_key") {
      const data = await listFormsForCompany(auth.companyId)
      return jsonOk(data)
    }

    const data = await listFormsForApi(auth.companyId)
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const requestedCompanyId =
      typeof body.companyId === "string" ? body.companyId : request.nextUrl.searchParams.get("companyId")
    // Mutations de formulário exigem sessão (actions usam getCurrentUser)
    await requireApiAuth(request, {
      requestedCompanyId,
      permission: "forms.create",
      sessionOnly: true,
    })

    const result = await saveForm({
      companyId: requestedCompanyId,
      title: String(body.title ?? ""),
      slug: body.slug != null ? String(body.slug) : undefined,
      description: body.description != null ? String(body.description) : undefined,
      status: body.status as "draft" | "published" | "archived" | undefined,
      targetStageId: body.targetStageId != null ? String(body.targetStageId) : null,
      successMessage: body.successMessage != null ? String(body.successMessage) : undefined,
      submitButtonLabel: body.submitButtonLabel != null ? String(body.submitButtonLabel) : undefined,
      createPerson: body.createPerson != null ? Boolean(body.createPerson) : undefined,
      isActive: body.isActive != null ? Boolean(body.isActive) : undefined,
    })

    if (!result.ok) {
      return jsonError(new Error(result.error ?? "Erro ao criar formulário"))
    }
    return jsonOk({ id: result.id }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
