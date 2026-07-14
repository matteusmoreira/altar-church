import { notFound } from "next/navigation"
import { FormBuilderClient } from "./form-builder-client"
import { getFormBuilderData } from "@/lib/forms/data"
import { listWebhookEndpoints } from "@/lib/integrations/webhooks"

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function FormBuilderPage({ params }: PageProps) {
  const { id } = await params
  const data = await getFormBuilderData(id)
  if (!data) notFound()
  let formWebhooks: Awaited<ReturnType<typeof listWebhookEndpoints>> = []
  try {
    formWebhooks = await listWebhookEndpoints({ companyId: data.companyId, formId: id })
  } catch {
    formWebhooks = []
  }
  return <FormBuilderClient data={data} formWebhooks={formWebhooks} />
}
