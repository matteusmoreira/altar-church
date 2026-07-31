import { notFound } from "next/navigation"
import { MemberDetailClient } from "./member-detail-client"
import { getPersonDetail, getPersonFormOptions } from "@/lib/people/data"
import { listFollowUpResponsibleOptions } from "@/lib/people/follow-up"

type PageParams = {
  id: string
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { id } = await params
  const [person, formOptions, responsibleOptions] = await Promise.all([
    getPersonDetail(id),
    getPersonFormOptions(),
    listFollowUpResponsibleOptions(),
  ])

  if (!person) {
    notFound()
  }

  return <MemberDetailClient person={person} cells={formOptions.cells} responsibleOptions={responsibleOptions} />
}
