import { notFound } from "next/navigation"
import { FormBuilderClient } from "./form-builder-client"
import { getFormBuilderData } from "@/lib/forms/data"
import { listDeliveries, listWebhookEndpoints } from "@/lib/integrations/webhooks"

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ submissionsPage?: string | string[] }>
}

export default async function FormBuilderPage({ params, searchParams }: PageProps) {
  const { id } = await params
  const query = await searchParams
  const rawSubmissionPage = Array.isArray(query.submissionsPage)
    ? query.submissionsPage[0]
    : query.submissionsPage
  const parsedSubmissionPage = Number.parseInt(rawSubmissionPage ?? "1", 10)
  const data = await getFormBuilderData(id, undefined, {
    submissionPage: Number.isFinite(parsedSubmissionPage) ? parsedSubmissionPage : 1,
  })
  if (!data) notFound()
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
