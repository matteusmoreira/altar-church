"use client"

import { useTransition } from "react"
import { Check, Clock3, UserMinus, Users, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { reviewMinistryMembership } from "@/lib/member/actions"
import type { MinistryMembershipAdminItem } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function MinistryMembershipManager({ memberships }: { memberships: MinistryMembershipAdminItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const requests = memberships.filter((item) => item.status === "pending")
  const active = memberships.filter((item) => item.status === "active")

  function review(membershipId: string, decision: "approve" | "reject" | "remove") {
    startTransition(async () => {
      const result = await reviewMinistryMembership({ membershipId, decision })
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível revisar")
      } else {
        toast.success(decision === "approve" ? "Participante aprovado" : decision === "reject" ? "Pedido rejeitado" : "Participante removido")
        router.refresh()
      }
    })
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Participantes e solicitações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-warning" />Pendentes ({requests.length})</h3>
          {requests.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.personName}</p>
                <p className="text-xs text-muted-foreground">{item.ministryName}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={pending} onClick={() => review(item.id, "approve")}><Check className="mr-1 h-4 w-4" />Aprovar</Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => review(item.id, "reject")}><X className="mr-1 h-4 w-4" />Rejeitar</Button>
              </div>
            </div>
          ))}
          {requests.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Participantes ativos ({active.length})</h3>
          {active.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{item.personName}</p>
                <p className="text-xs text-muted-foreground">{item.ministryName}</p>
              </div>
              {item.role === "leader" ? <Badge>Líder</Badge> : (
                <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => review(item.id, "remove")}>
                  <UserMinus className="mr-1 h-4 w-4" />Remover
                </Button>
              )}
            </div>
          ))}
        </section>
      </CardContent>
    </Card>
  )
}
