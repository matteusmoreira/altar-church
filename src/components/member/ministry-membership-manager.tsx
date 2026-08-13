"use client"

import { useSyncExternalStore, useTransition } from "react"
import { Check, Clock3, Grid2X2, List, UserMinus, Users, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { reviewMinistryMembership } from "@/lib/member/actions"
import type { MinistryMembershipAdminItem } from "@/lib/member/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type ViewMode = "list" | "grid"

const MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY = "altar-church:ministry-memberships-view-mode"
const MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT = "altar-church:ministry-memberships-view-mode-change"
let currentMinistryMembershipsViewMode: ViewMode = "list"

function subscribeToMinistryMembershipsViewMode(callback: () => void) {
  window.addEventListener(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT, callback)
  return () => window.removeEventListener(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT, callback)
}

function getMinistryMembershipsViewMode(): ViewMode {
  try {
    const storedViewMode = window.localStorage.getItem(MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY)
    if (storedViewMode === "list" || storedViewMode === "grid") currentMinistryMembershipsViewMode = storedViewMode
  } catch { }
  return currentMinistryMembershipsViewMode
}

function getServerViewMode(): ViewMode {
  return "list"
}

export function MinistryMembershipManager({ memberships }: { memberships: MinistryMembershipAdminItem[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const viewMode = useSyncExternalStore(subscribeToMinistryMembershipsViewMode, getMinistryMembershipsViewMode, getServerViewMode)
  const requests = memberships.filter((item) => item.status === "pending")
  const active = memberships.filter((item) => item.status === "active")

  const changeViewMode = (nextViewMode: ViewMode) => {
    currentMinistryMembershipsViewMode = nextViewMode
    try {
      window.localStorage.setItem(MINISTRY_MEMBERSHIPS_VIEW_MODE_KEY, nextViewMode)
    } catch { }
    window.dispatchEvent(new Event(MINISTRY_MEMBERSHIPS_VIEW_MODE_EVENT))
  }

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Participantes e solicitações</CardTitle>
          <div className="flex w-fit self-end rounded-md border p-1 sm:self-auto" aria-label="Modo de visualização">
            <Button
              type="button"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Ver participantes em lista"
              aria-pressed={viewMode === "list"}
              title="Lista"
              onClick={() => changeViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Ver participantes em grade"
              aria-pressed={viewMode === "grid"}
              title="Grade"
              onClick={() => changeViewMode("grid")}
            >
              <Grid2X2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-warning" />Pendentes ({requests.length})</h3>
          <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2" : "space-y-3"}>
            {requests.map((item) => (
              <div key={item.id} className={viewMode === "grid" ? "flex h-full flex-col gap-3 rounded-xl border p-3" : "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.personName}</p>
                  <p className="text-xs text-muted-foreground">{item.ministryName}</p>
                </div>
                <div className={viewMode === "grid" ? "flex flex-wrap gap-2" : "flex gap-2"}>
                  <Button size="sm" disabled={pending} onClick={() => review(item.id, "approve")}><Check className="mr-1 h-4 w-4" />Aprovar</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => review(item.id, "reject")}><X className="mr-1 h-4 w-4" />Rejeitar</Button>
                </div>
              </div>
            ))}
          </div>
          {requests.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>}
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Participantes ativos ({active.length})</h3>
          <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
            {active.map((item) => (
              <div key={item.id} className={viewMode === "grid" ? "flex h-full flex-col gap-3 rounded-xl border p-3" : "flex items-center gap-3 rounded-xl border p-3"}>
                <div className={viewMode === "grid" ? "min-w-0" : "min-w-0 flex-1"}>
                  <p className="font-medium">{item.personName}</p>
                  <p className="text-xs text-muted-foreground">{item.ministryName}</p>
                </div>
                <div className={viewMode === "grid" ? "flex justify-end" : "shrink-0"}>
                  {item.role === "leader" ? <Badge>Líder</Badge> : (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => review(item.id, "remove")}>
                      <UserMinus className="mr-1 h-4 w-4" />Remover
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  )
}
