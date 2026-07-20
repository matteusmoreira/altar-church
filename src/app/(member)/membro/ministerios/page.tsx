import { MemberMinistries } from "@/components/member/member-ministries"
import { listMemberMinistries } from "@/lib/member/data"

export default async function MemberMinistriesPage() {
  return <MemberMinistries ministries={await listMemberMinistries()} />
}
