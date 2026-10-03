import { notFound } from "next/navigation"
import { MemberDetailClient } from "./member-detail-client"
import { getPersonDetail, getPersonFormOptions } from "@/lib/people/data"
import { listFollowUpResponsibleOptions } from "@/lib/people/follow-up"
import { requireUser } from "@/lib/auth/server"
import { hasPermission } from "@/lib/types"

type PageParams = {
  id: string
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { id } = await params
  const [person, formOptions, responsibleOptions, user] = await Promise.all([
    getPersonDetail(id),
    getPersonFormOptions(),
    listFollowUpResponsibleOptions(),
    requireUser(),
  ])

  if (!person) {
    notFound()
  }

  return (
    <MemberDetailClient
      person={person}
      cells={formOptions.cells}
      responsibleOptions={responsibleOptions}
      canManageKids={hasPermission(user.role, "kids.children.manage")}
    />
  )
}
