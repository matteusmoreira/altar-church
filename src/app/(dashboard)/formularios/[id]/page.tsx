import { notFound } from "next/navigation"
import { FormBuilderClient } from "./form-builder-client"
import { getFormBuilderData } from "@/lib/forms/data"
import { listDeliveries, listWebhookEndpoints } from "@/lib/integrations/webhooks"

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function FormBuilderPage({ params }: PageProps) {
  const { id } = await params
  const data = await getFormBuilderData(id)
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
