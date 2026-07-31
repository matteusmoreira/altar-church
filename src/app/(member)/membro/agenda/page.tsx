import { MemberAgenda } from "@/components/member/member-agenda"
import { listMemberAgenda } from "@/lib/member/data"

export default async function MemberAgendaPage() {
  return <MemberAgenda events={await listMemberAgenda()} />
}
