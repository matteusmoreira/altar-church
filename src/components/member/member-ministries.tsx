"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Clock3, HeartHandshake, RotateCcw, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { cancelMinistryMembershipRequest, requestMinistryMembership } from "@/lib/member/actions"
import type { MemberMinistryItem } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const statusLabel = {
  active: "Participando",
  pending: "Aguardando aprovação",
  rejected: "Pedido não aprovado",
  inactive: "Não participante",
}

export function MemberMinistries({ ministries }: { ministries: MemberMinistryItem[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(ministryId: string, cancel = false) {
    setPendingId(ministryId)
    startTransition(async () => {
      const result = cancel
        ? await cancelMinistryMembershipRequest({ ministryId })
        : await requestMinistryMembership({ ministryId })
      setPendingId(null)
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível concluir")
      } else {
        toast.success(cancel ? "Solicitação cancelada" : "Solicitação enviada")
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-5 lg:pt-12">
      <div>
        <Badge variant="outline" className="mb-2"><HeartHandshake className="mr-1 h-3 w-3" />Conecte-se</Badge>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ministérios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Conheça equipes, encontre seu lugar e acompanhe seus pedidos.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ministries.map((ministry) => {
          const loading = isPending && pendingId === ministry.id
          return (
            <Card key={ministry.id} className="overflow-hidden rounded-3xl border-border/60 bg-card/85 py-0 shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-violet-500" />
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{ministry.name}</h2>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{ministry.description || "Ministério aberto para servir e crescer em comunidade."}</p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <HeartHandshake className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><UserRound className="h-3 w-3" />{ministry.leaderName || ministry.contact || "Liderança da igreja"}</span>
                  <span className="rounded-full bg-muted px-2.5 py-1">{ministry.memberCount} participantes</span>
                </div>
                {ministry.membershipStatus && (
                  <Badge variant={ministry.membershipStatus === "active" ? "default" : "secondary"}>
                    {ministry.membershipStatus === "active" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
                    {statusLabel[ministry.membershipStatus]}
                  </Badge>
                )}
                {ministry.membershipStatus === "active" ? null : ministry.membershipStatus === "pending" ? (
                  <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" disabled={loading} onClick={() => run(ministry.id, true)}>
                    Cancelar solicitação
                  </Button>
                ) : (
                  <Button type="button" className="min-h-11 w-full rounded-xl gradient-primary" disabled={loading} onClick={() => run(ministry.id)}>
                    {ministry.membershipStatus === "rejected" || ministry.membershipStatus === "inactive" ? <RotateCcw className="mr-2 h-4 w-4" /> : <HeartHandshake className="mr-2 h-4 w-4" />}
                    {loading ? "Enviando..." : "Quero participar"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
      {ministries.length === 0 && (
        <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhum ministério ativo no momento.</div>
      )}
    </div>
  )
}
