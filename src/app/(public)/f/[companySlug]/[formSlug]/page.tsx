import { canonicalEntityPath, type RouteSearchParams } from "@/lib/navigation/entity-slugs"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { PublicFormClient } from "./public-form-client"
import { getPublicFormData } from "@/lib/forms/data"

type PageProps = {
  params: Promise<{ companySlug: string; formSlug: string }>
  searchParams: Promise<RouteSearchParams>
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

export default async function PublicFormPage({ params, searchParams }: PageProps) {
  const { companySlug, formSlug } = await params
  const data = await getPublicFormData(companySlug, formSlug)
  if (!data) notFound()
  if (formSlug !== data.form.slug) redirect(canonicalEntityPath(`/f/${companySlug}`, data.form.slug, await searchParams))
  return <PublicFormClient data={data} />
}
