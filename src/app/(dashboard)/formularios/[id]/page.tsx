import { resolveEntityRoute, canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import { notFound, redirect } from "next/navigation"
import { FormBuilderClient } from "./form-builder-client"
import { getFormBuilderData } from "@/lib/forms/data"
import { listDeliveries, listWebhookEndpoints } from "@/lib/integrations/webhooks"

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<RouteSearchParams>
}

export default async function FormBuilderPage({ params, searchParams }: PageProps) {
  const { id: identifier } = await params
  const route = await resolveEntityRoute("forms", identifier)
  if (!route) notFound()
  const id = route.id
  const query = await searchParams
  const rawSubmissionPage = Array.isArray(query.submissionsPage)
    ? query.submissionsPage[0]
    : query.submissionsPage
  const parsedSubmissionPage = Number.parseInt(rawSubmissionPage ?? "1", 10)
  const data = await getFormBuilderData(id, undefined, {
    submissionPage: Number.isFinite(parsedSubmissionPage) ? parsedSubmissionPage : 1,
  })
  if (!data) notFound()
  if (identifier !== route.slug) redirect(canonicalEntityPath("/formularios", route.slug, await searchParams))
  let formWebhooks: Awaited<ReturnType<typeof listWebhookEndpoints>> = []
  let formDeliveries: Awaited<ReturnType<typeof listDeliveries>> = []
  try {
    ;[formWebhooks, formDeliveries] = await Promise.all([
      listWebhookEndpoints({ companyId: data.companyId, formId: id }),
      listDeliveries({ companyId: data.companyId, formId: id, limit: 30 }),
    ])
  } catch {
    formWebhooks = []
    formDeliveries = []
  }
  return (
    <FormBuilderClient
      data={data}
      formWebhooks={formWebhooks}
      formDeliveries={formDeliveries}
    />
  )
}
