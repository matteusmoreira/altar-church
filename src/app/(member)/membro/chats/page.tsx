import { requireMemberContext } from "@/lib/member/access"
import { listMinistryChats } from "@/lib/ministries/chat-server"
import { MinistryChatCenter } from "@/components/ministries/ministry-chat-center"
export default async function MemberChatsPage({ searchParams }: { searchParams: Promise<{ ministry?: string }> }) {
  await requireMemberContext()
  const { ministry } = await searchParams
  return <MinistryChatCenter initialChats={await listMinistryChats()} selectedId={ministry} />
}
