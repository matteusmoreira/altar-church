"use client"

import Link from "next/link"
import { BellOff, MessageCircle } from "lucide-react"
import type { MinistryChatSummary } from "@/lib/ministries/chat-contract"
import { useMinistryChatSummaries } from "./chat-client"
import { MinistryChat } from "./ministry-chat"
import { cn } from "@/lib/utils"

export function MinistryChatCenter({ initialChats, selectedId }: { initialChats: MinistryChatSummary[]; selectedId?: string }) {
  const { chats, error } = useMinistryChatSummaries(initialChats)
  const selected = chats.find(chat => chat.id === selectedId)
  return <div className="space-y-5 lg:pt-12">
    <div><h1 className="text-2xl font-bold">Meus chats</h1><p className="mt-1 text-sm text-muted-foreground">Converse com os ministérios dos quais você participa.</p></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {chats.length > 0 ? <div className="space-y-2" aria-label="Conversas dos ministérios">{chats.map(chat => <Link key={chat.id} href={`/membro/chats?ministry=${chat.id}`} aria-current={selected?.id === chat.id ? "page" : undefined} className={cn("flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50", selected?.id === chat.id && "border-primary bg-primary/5")}>
      <MessageCircle className="h-5 w-5 shrink-0 text-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{chat.name}</p><p className="truncate text-xs text-muted-foreground">{chat.lastMessage}</p></div>{chat.muted && <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Avisos silenciados" />}{chat.unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground" aria-label={`${chat.unread} não lidas`}>{chat.unread > 99 ? "99+" : chat.unread}</span>}
    </Link>)}</div> : !error && <div className="rounded-2xl border bg-card px-5 py-12 text-center"><MessageCircle className="mx-auto mb-3 h-9 w-9 text-muted-foreground" /><p className="font-medium">Você ainda não participa de um chat</p><p className="mt-1 text-sm text-muted-foreground">Os chats aparecem quando sua participação em um ministério é aprovada.</p><Link href="/membro/ministerios" className="mt-4 inline-block text-sm font-semibold text-primary">Conhecer ministérios</Link></div>}
    {selected ? <MinistryChat key={selected.id} ministryId={selected.id} name={selected.name} /> : selectedId ? <p role="status" className="text-sm text-muted-foreground">Esta conversa não está disponível para sua conta.</p> : chats.length > 0 && <p className="py-8 text-center text-sm text-muted-foreground">Escolha um ministério para abrir a conversa.</p>}
  </div>
}
