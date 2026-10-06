import Link from "next/link"
import { requireChatAccess } from "@/lib/ministries/chat-server"
import { getSql } from "@/lib/db/client"
import { MinistryChat } from "@/components/ministries/ministry-chat"
export default async function MinistryChatPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireChatAccess((await params).id)
  const [ministry] = await getSql()<{ name: string }[]>`select name from public.ministries where id=${access.ministryId}`
  return <div className="space-y-4"><Link href={`/ministerios/${access.ministrySlug ?? access.ministryId}`} className="text-sm text-primary">← Voltar ao ministério</Link><MinistryChat ministryId={access.ministryId} name={ministry.name} /></div>
}
