"use client"

import { createContext, createElement, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react"
import { createClient } from "@/lib/supabase/client"
import type { MinistryChatSummary } from "@/lib/ministries/chat-contract"

export class ChatRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export async function chatRequest<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      method, cache: "no-store", signal, headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new ChatRequestError("Conexão interrompida. Tente novamente", 0)
  }
  const unavailable = "Serviço temporariamente indisponível. Tente novamente"
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ChatRequestError(unavailable, response.status)
  }
  let result
  try { result = await response.json() }
  catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error
    throw new ChatRequestError(unavailable, response.status)
  }
  if (!response.ok) throw new ChatRequestError(result.error?.message ?? "Não foi possível concluir. Tente novamente", response.status)
  return result.data as T
}
type SummaryState = { chats: MinistryChatSummary[]; error: string; refresh: () => Promise<void> }
const SummaryContext = createContext<SummaryState | null>(null)
export function MinistryChatSummaryProvider({ children }: { children: ReactNode }) {
  return createElement(SummaryContext.Provider, { value: useMinistryChatSummaries() }, children)
}
export function useMinistryChatSummaries(initial: MinistryChatSummary[] = []) {
  const shared = useContext(SummaryContext)
  const [chats, setChats] = useState(initial)
  const [error, setError] = useState("")
  const channelId = useId()
  const refresh = useCallback(async () => {
    try { setChats(await chatRequest<MinistryChatSummary[]>("/api/v1/ministries/chats")); setError("") }
    catch (error) {
      if (error instanceof ChatRequestError && [401, 403].includes(error.status)) setChats([])
      setError(error instanceof Error ? error.message : "Não foi possível atualizar os chats")
    }
  }, [])
  useEffect(() => {
    if (shared) return
    let active = true
    const update = () => { if (active) void refresh() }
    const client = createClient()
    const channel = client.channel(`ministry-chat-list-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ministry_chat_messages" }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "ministry_chat_reads" }, update)
      .subscribe(status => { if (status === "SUBSCRIBED") update() })
    update()
    const timer = setInterval(update, 15_000)
    window.addEventListener("ministry-chat-change", update)
    window.addEventListener("focus", update)
    return () => { active = false; clearInterval(timer); window.removeEventListener("ministry-chat-change", update); window.removeEventListener("focus", update); void client.removeChannel(channel) }
  }, [channelId, refresh, shared])
  return shared ?? { chats, error, refresh }
}
export function announceChatChange() { window.dispatchEvent(new Event("ministry-chat-change")) }
