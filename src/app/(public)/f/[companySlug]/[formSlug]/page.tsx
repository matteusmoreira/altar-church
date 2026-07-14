import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PublicFormClient } from "./public-form-client"
import { getPublicFormData } from "@/lib/forms/data"

type PageProps = {
  params: Promise<{ companySlug: string; formSlug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { companySlug, formSlug } = await params
  const data = await getPublicFormData(companySlug, formSlug)
  if (!data) {
    return { title: "Formulário não encontrado" }
  }
  return {
    title: `${data.form.title} · ${data.publicName}`,
    description: data.form.description || `Formulário de ${data.publicName}`,
  }
}

export default async function PublicFormPage({ params }: PageProps) {
  const { companySlug, formSlug } = await params
  const data = await getPublicFormData(companySlug, formSlug)
  if (!data) notFound()
  return <PublicFormClient data={data} />
}
