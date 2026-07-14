import type { NextRequest } from "next/server"
import { requireApiAuth } from "@/lib/api/auth"
import { notFound } from "@/lib/api/errors"
import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { deleteForm, saveForm } from "@/lib/forms/actions"
import { getFormBuilderData, listFormsForCompany } from "@/lib/forms/data"
import { getSql } from "@/lib/db/client"

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

    if (auth.authType === "api_key") {
      const sql = getSql()
      const rows = await sql`
        select f.id from public.forms f
        where f.id = ${id} and f.company_id = ${auth.companyId} and f.deleted_at is null
        limit 1
      `
      if (!rows[0]) throw notFound("Formulário não encontrado")
      // Reuse builder-shaped data without session permission (already scoped)
      const forms = await listFormsForCompany(auth.companyId)
      const form = forms.find((f) => f.id === id)
      if (!form) throw notFound("Formulário não encontrado")
      return jsonOk(form)
    }

    const data = await getFormBuilderData(id, auth.companyId)
    if (!data) throw notFound("Formulário não encontrado")
    return jsonOk(data)
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = (await parseJsonBody(request)) as Record<string, unknown>
    const requestedCompanyId =
      typeof body.companyId === "string" ? body.companyId : request.nextUrl.searchParams.get("companyId")
    await requireApiAuth(request, {
      requestedCompanyId,
      permission: "forms.edit",
      sessionOnly: true,
    })

    const result = await saveForm({
      id,
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

    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao atualizar"))
    return jsonOk({ id: result.id })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null
    await requireApiAuth(request, {
      requestedCompanyId,
      permission: "forms.delete",
      sessionOnly: true,
    })

    const result = await deleteForm({ id, companyId: requestedCompanyId })
    if (!result.ok) return jsonError(new Error(result.error ?? "Erro ao remover"))
    return jsonOk({ id: result.id })
  } catch (error) {
    return jsonError(error)
  }
}
