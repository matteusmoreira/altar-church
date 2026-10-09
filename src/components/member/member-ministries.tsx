"use client"

import { useState, useTransition } from "react"
import { CheckCircle2, Clock3, HeartHandshake, RotateCcw, Settings2, UserRound } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  cancelMinistryMembershipRequest,
  requestMinistryMembership,
} from "@/lib/member/actions"
import type { MemberMinistryItem } from "@/lib/member/types"
import { EmptyState, PageHeader } from "@/components/shared"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { MinistryInformation } from "./ministry-information"

const statusLabel = {
  active: "Participando",
  pending: "Aguardando aprovação",
  rejected: "Pedido não aprovado",
  inactive: "Não participante",
}

export function MemberMinistries({ ministries, initialInformationId }: { ministries: MemberMinistryItem[]; initialInformationId?: string }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [informationId, setInformationId] = useState<string | null>(() => ministries.some(item => item.id === initialInformationId && item.membershipStatus === "active") ? initialInformationId! : null)
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
    <div className="space-y-6 lg:pt-12">
      <PageHeader
        title="Ministérios"
        description="Conheça equipes, encontre seu lugar e acompanhe seus pedidos."
        badge={<Badge variant="outline"><HeartHandshake className="mr-1 h-3 w-3" />Conecte-se</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {ministries.map((ministry) => {
          const loading = isPending && pendingId === ministry.id
          return (
            <Card key={ministry.id} className="overflow-hidden py-0 shadow-sm">
              <div className="h-1.5 bg-gradient-to-r from-primary via-blue-500 to-violet-500" />
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{ministry.name}</h2>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{ministry.description || "Ministério aberto para servir e crescer em comunidade."}</p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                    <HeartHandshake className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1"><UserRound className="h-3 w-3" />{ministry.leaderName || ministry.contact || "Liderança da igreja"}</span>
                  <span className="rounded-full bg-muted px-2.5 py-1">{ministry.memberCount} participantes</span>
                </div>
                {ministry.membershipRole === "leader" ? (
                  <Badge><UserRound className="mr-1 h-3 w-3" />Líder</Badge>
                ) : ministry.membershipStatus && (
                  <Badge variant={ministry.membershipStatus === "active" ? "default" : "secondary"}>
                    {ministry.membershipStatus === "active" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
                    {statusLabel[ministry.membershipStatus]}
                  </Badge>
                )}
                {ministry.membershipStatus === "active" && ministry.onboardingTotal > 0 ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground"><span>Integração</span><span>{ministry.onboardingPercent}%</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${ministry.onboardingPercent}%` }} /></div>
                  </div>
                ) : null}
                {ministry.membershipStatus === "active" && <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => setInformationId(ministry.id)}>Informações</Button><Button render={<Link href={`/membro/chats?ministry=${ministry.id}`} />} nativeButton={false} variant="outline" className="flex-1">Abrir chat</Button></div>}
                {ministry.membershipRole === "leader" || ministry.membershipStatus === "active" ? null : ministry.membershipStatus === "pending" ? (
                  <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={() => run(ministry.id, true)}>
                    Cancelar solicitação
                  </Button>
                ) : (
                  <Button type="button" variant="brand" className="w-full" disabled={loading} onClick={() => run(ministry.id)}>
                    {ministry.membershipStatus === "rejected" || ministry.membershipStatus === "inactive" ? <RotateCcw className="mr-2 h-4 w-4" /> : <HeartHandshake className="mr-2 h-4 w-4" />}
                    {loading ? "Enviando..." : "Quero participar"}
                  </Button>
                )}
                {ministry.canManage ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    render={<Link href={`/membro/ministerios/${ministry.slug || ministry.id}`} />}
                    nativeButton={false}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Configurar ministério
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
      {ministries.length === 0 && (
        <EmptyState variant="card" icon={HeartHandshake} title="Nenhum ministério ativo no momento." />
      )}
      {informationId && <MinistryInformation key={informationId} ministryId={informationId} name={ministries.find(item => item.id===informationId)?.name || "Ministério"} open onOpenChange={value => { if (!value) setInformationId(null) }} />}

    </div>
  )
}
