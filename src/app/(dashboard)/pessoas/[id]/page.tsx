import { notFound } from "next/navigation"
import { MemberDetailClient } from "./member-detail-client"
import { getPersonDetail, getPersonFormOptions } from "@/lib/people/data"

type PageParams = {
  id: string
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { id } = await params
  const [person, formOptions] = await Promise.all([getPersonDetail(id), getPersonFormOptions()])

  if (!person) {
    notFound()
  }

  return <MemberDetailClient person={person} cells={formOptions.cells} />
}
