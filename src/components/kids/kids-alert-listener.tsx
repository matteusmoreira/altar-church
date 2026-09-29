"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { triggerKidsAlert } from "@/lib/kids/notifications"

export function KidsAlertListener() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel("member-shell-kids-alert")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "kid_conversation_messages",
        },
        (payload) => {
          const newMsg = payload.new as {
            sender_kind?: string
            body?: string
          } | null

          if (newMsg && newMsg.sender_kind === "staff") {
            // Dispara som, vibração e notificação nativa
            triggerKidsAlert(newMsg.body ?? "Mensagem da equipe do Kids")

            // Alerta visual de destaque
            toast.warning("🚨 Nova mensagem do Ministério Kids", {
              description: newMsg.body ?? "A equipe enviou uma mensagem sobre seu filho.",
              duration: 12000,
              action: {
                label: "Ver no Kids",
                onClick: () => {
                  router.push("/membro/kids")
                },
              },
            })

            router.refresh()
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
