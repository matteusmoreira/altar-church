import { MemberAgenda } from "@/components/member/member-agenda"
import { listMemberAgenda } from "@/lib/member/data"

export default async function MemberAgendaPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const query = await searchParams
  return <MemberAgenda key={query.event || "agenda"} events={await listMemberAgenda()} initialEventId={query.event} />
}
