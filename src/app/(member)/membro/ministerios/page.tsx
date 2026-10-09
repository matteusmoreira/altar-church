import { MemberMinistries } from "@/components/member/member-ministries"
import { listMemberMinistries } from "@/lib/member/data"

export default async function MemberMinistriesPage({ searchParams }: { searchParams: Promise<{ ministry?: string }> }) {
  const query = await searchParams
  return <MemberMinistries key={query.ministry || "list"} ministries={await listMemberMinistries()} initialInformationId={query.ministry} />
}
