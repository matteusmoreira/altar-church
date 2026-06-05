import { notFound } from "next/navigation"
import { MemberDetailClient } from "./member-detail-client"
import { getPersonDetail } from "@/lib/people/data"

type PageParams = {
  id: string
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { id } = await params
  const person = await getPersonDetail(id)

  if (!person) {
    notFound()
  }

  return <MemberDetailClient person={person} />
}
