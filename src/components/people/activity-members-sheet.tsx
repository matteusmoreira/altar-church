"use client"

import { useEffect, useState, useTransition } from "react"
import {
  Activity,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  UserCheck,
  UserMinus,
  UserRound,
  Users,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import {
  assignPersonActivity,
  loadActivityMembers,
  removePersonActivity,
  togglePersonActivityAssignment,
} from "@/app/(dashboard)/pessoas/actions"
import type { PersonActivityWithCount } from "@/lib/people/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface ActivityMember {
  assignmentId: string
  personId: string
  fullName: string
  email: string | null
  phone: string
  assignedAt: string
  isActive: boolean
}

interface ActivityMembersSheetProps {
  activity: PersonActivityWithCount | null
  open: boolean
  onOpenChange: (open: boolean) => void
  availablePeople?: { id: string; fullName: string; email?: string | null }[]
  onMembersChanged?: () => void
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function ActivityMembersSheet({
  activity,
  open,
  onOpenChange,
  availablePeople = [],
  onMembersChanged,
}: ActivityMembersSheetProps) {
  const [members, setMembers] = useState<ActivityMember[]>([])
  const [loading, setLoading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [searchMember, setSearchMember] = useState("")
  const [selectedPersonId, setSelectedPersonId] = useState("")

  const fetchMembers = async () => {
    if (!activity) return
    setLoading(true)
    try {
      const data = await loadActivityMembers(activity.id)
      setMembers(data)
    } catch (err) {
      toast.error("Erro ao carregar membros da atividade")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && activity) {
      fetchMembers()
      setSelectedPersonId("")
      setSearchMember("")
    }
  }, [open, activity?.id])

  const handleAssignPerson = () => {
    if (!activity || !selectedPersonId) {
      toast.error("Selecione uma pessoa para vincular")
      return
    }

    startTransition(async () => {
      const res = await assignPersonActivity({
        personId: selectedPersonId,
        activityId: activity.id,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao vincular pessoa")
        return
      }
      toast.success("Pessoa vinculada com sucesso!")
      setSelectedPersonId("")
      fetchMembers()
      onMembersChanged?.()
    })
  }

  const handleRemoveMember = (assignmentId: string, name: string) => {
    startTransition(async () => {
      const res = await removePersonActivity(assignmentId)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao desvincular pessoa")
        return
      }
      toast.success(`${name} desvinculado(a) da atividade`)
      fetchMembers()
      onMembersChanged?.()
    })
  }

  const handleToggleStatus = (assignmentId: string, currentActive: boolean) => {
    startTransition(async () => {
      const res = await togglePersonActivityAssignment(assignmentId, !currentActive)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao atualizar status do vínculo")
        return
      }
      toast.success(!currentActive ? "Vínculo ativado" : "Vínculo pausado")
      fetchMembers()
      onMembersChanged?.()
    })
  }

  const filteredMembers = members.filter(
    (m) =>
      m.fullName.toLowerCase().includes(searchMember.toLowerCase()) ||
      (m.email && m.email.toLowerCase().includes(searchMember.toLowerCase())),
  )

  // Filter people who are not already actively assigned
  const assignedPersonIds = new Set(members.filter((m) => m.isActive).map((m) => m.personId))
  const assignablePeople = availablePeople.filter((p) => !assignedPersonIds.has(p.id))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full flex flex-col p-6 overflow-y-auto">
        <SheetHeader className="space-y-1 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <SheetTitle className="text-lg font-bold">{activity?.description}</SheetTitle>
          </div>
          <SheetDescription className="flex items-center gap-2 text-xs">
            <span>Categoria: <span className="font-medium capitalize">{activity?.category}</span></span>
            <span>•</span>
            <Badge variant="outline" className="text-[11px] h-5">
              {members.length} {members.length === 1 ? "pessoa" : "pessoas"} vinculadas
            </Badge>
          </SheetDescription>
        </SheetHeader>

        {/* Vincular Nova Pessoa */}
        <div className="py-4 border-b border-border/40 space-y-3">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-primary" /> Vincular nova pessoa à atividade
          </Label>
          <div className="flex gap-2">
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="h-9 flex-1 rounded-md border bg-background px-3 text-xs"
              disabled={pending}
            >
              <option value="">Selecione uma pessoa...</option>
              {assignablePeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} {p.email ? `(${p.email})` : ""}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={handleAssignPerson}
              disabled={!selectedPersonId || pending}
              className="h-9 text-xs gradient-primary"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vincular"}
            </Button>
          </div>
        </div>

        {/* Busca e Lista de Membros */}
        <div className="flex-1 space-y-3 py-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Membros Atribuídos ({members.length})
            </h4>
            {members.length > 5 && (
              <Input
                placeholder="Filtrar nesta lista..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                className="h-7 text-xs max-w-44"
              />
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando membros...
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 space-y-2 rounded-lg border border-dashed border-border/60 p-6 bg-muted/10">
              <Users className="h-8 w-8 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium">Nenhuma pessoa vinculada ainda</p>
              <p className="text-xs text-muted-foreground">
                Selecione uma pessoa acima para atribuir a este ministério ou atividade.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <div
                  key={member.assignmentId}
                  className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors ${
                    member.isActive
                      ? "border-border/40 bg-muted/20"
                      : "border-border/20 bg-muted/5 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="h-8 w-8 text-xs shrink-0">
                      <AvatarFallback className="gradient-primary text-[11px] text-white">
                        {initials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{member.fullName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {member.email || member.phone || "Sem contato informado"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={member.isActive ? "Pausar vínculo" : "Ativar vínculo"}
                      onClick={() => handleToggleStatus(member.assignmentId, member.isActive)}
                      disabled={pending}
                    >
                      {member.isActive ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Desvincular pessoa"
                      onClick={() => handleRemoveMember(member.assignmentId, member.fullName)}
                      disabled={pending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
