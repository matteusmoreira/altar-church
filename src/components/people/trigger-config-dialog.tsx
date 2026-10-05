"use client"

import { useId, useState, useTransition } from "react"
import { Loader2, Settings2 } from "lucide-react"
import { toast } from "sonner"
import { saveFollowUpTrigger } from "@/app/(dashboard)/pessoas/actions"
import { parseFollowUpConfig } from "@/lib/people/follow-up-config"
import { isFollowUpPriority, type PersonFollowUpPriority, type PersonFollowUpTrigger } from "@/lib/people/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

export const triggerLabels: Record<string, { label: string; description: string; defaultDays: number }> = {
  new_visitor: {
    label: "Novo visitante cadastrado",
    description: "Cria tarefa de follow-up pastoral quando um novo visitante é registrado.",
    defaultDays: 7,
  },
  visitor_without_contact: {
    label: "Visitante sem contato",
    description: "Cria tarefa para completar o cadastro de visitantes sem telefone e sem e-mail.",
    defaultDays: 7,
  },
  recurring_absence: {
    label: "Ausência recorrente em cultos",
    description: "Cria tarefa para quem teve presença nos últimos 90 dias, mas está há vários dias sem presença registrada. Pode gerar uma nova tarefa por mês.",
    defaultDays: 30,
  },
  without_cell: {
    label: "Pessoa sem célula ativa",
    description: "Cria tarefa para pessoas ativas que não participam de uma célula ativa.",
    defaultDays: 14,
  },
  new_prayer_request: {
    label: "Novo pedido de oração",
    description: "Cria tarefa para a equipe de intercessão ou pastor atender ao pedido de oração.",
    defaultDays: 3,
  },
  without_portal_access: {
    label: "Membro sem acesso ao app/portal",
    description: "Alerta para convidar o membro a acessar seu portal exclusivo da igreja.",
    defaultDays: 15,
  },
}

interface TriggerConfigDialogProps {
  trigger: PersonFollowUpTrigger | null
  triggerKind?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  responsibleOptions: { id: string; name: string }[]
  onSaved?: () => void
}

export function TriggerConfigDialog({
  trigger,
  triggerKind,
  open,
  onOpenChange,
  responsibleOptions,
  onSaved,
}: TriggerConfigDialogProps) {
  const [pending, startTransition] = useTransition()
  const fieldId = useId()

  const kind = trigger?.triggerKind ?? triggerKind ?? "new_visitor"
  const meta = triggerLabels[kind] ?? {
    label: "Gatilho de Follow-up",
    description: "Configuração do gatilho automático.",
    defaultDays: 14,
  }

  const [name, setName] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [daysThreshold, setDaysThreshold] = useState(meta.defaultDays)
  const [dueDays, setDueDays] = useState(2)
  const [priority, setPriority] = useState<PersonFollowUpPriority>("normal")
  const [responsibleId, setResponsibleId] = useState("")
  const [notes, setNotes] = useState("")

  // Preenche o formulário durante o render quando o gatilho, o tipo ou a abertura
  // mudam, evitando commitar estado intermediário e render em cascata.
  const [synced, setSynced] = useState<{
    trigger: PersonFollowUpTrigger | null
    kind: string
    open: boolean
  } | null>(null)
  if (!synced || trigger !== synced.trigger || kind !== synced.kind || open !== synced.open) {
    setSynced({ trigger, kind, open })
    if (trigger) {
      setName(trigger.name)
      setIsActive(trigger.isActive)
      const cfg = (trigger.config ?? {}) as Record<string, unknown>
      setDaysThreshold(typeof cfg.daysThreshold === "number" ? cfg.daysThreshold : meta.defaultDays)
      setDueDays(typeof cfg.dueDays === "number" ? cfg.dueDays : 2)
      setPriority(isFollowUpPriority(cfg.priority) ? cfg.priority : "normal")
      setResponsibleId(typeof cfg.responsibleProfileId === "string" ? cfg.responsibleProfileId : "")
      setNotes(typeof cfg.notes === "string" ? cfg.notes : "")
    } else {
      setName(`Acompanhar ${meta.label.toLowerCase()}`)
      setIsActive(true)
      setDaysThreshold(meta.defaultDays)
      setDueDays(2)
      setPriority("normal")
      setResponsibleId("")
      setNotes("Entrar em contato para orar, acolher e orientar os próximos passos.")
    }
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Informe o nome da tarefa gerada pelo gatilho")
      return
    }

    let config
    try {
      config = parseFollowUpConfig({ daysThreshold, dueDays, priority, responsibleProfileId: responsibleId || null, notes: notes.trim() })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revise a configuração")
      return
    }

    startTransition(async () => {
      try {
        const res = await saveFollowUpTrigger({
          id: trigger?.id ?? null,
          triggerKind: kind,
          name: name.trim(),
          isActive,
          config,
        })

        if (!res.ok) {
          toast.error(res.error ?? "Erro ao salvar gatilho")
          return
        }

        toast.success("Gatilho de follow-up salvo com sucesso!")
        onOpenChange(false)
        onSaved?.()
      } catch {
        toast.error("Não foi possível salvar a regra. Tente novamente.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="space-y-1 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            <DialogTitle className="text-base">Configurar regra: {meta.label}</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            {meta.description}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-3">
          {/* Status Ativo/Pausado */}
          <div className="flex items-center justify-between rounded-lg border border-border/40 p-3 bg-muted/20">
            <div>
              <Label htmlFor={`${fieldId}-active`} className="text-xs font-semibold">Gatilho em Operação</Label>
              <p className="text-[11px] text-muted-foreground">
                Gatilhos pausados não geram novas tarefas durante as varreduras automáticas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isActive ? "default" : "secondary"} className="text-[10px]">
                {isActive ? "Ativo" : "Pausado"}
              </Badge>
              <Switch id={`${fieldId}-active`} checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          {/* Nome da Tarefa */}
          <div className="grid gap-2">
            <Label htmlFor={`${fieldId}-name`} className="text-xs font-medium">Nome da Tarefa Gerada *</Label>
            <Input
              id={`${fieldId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Primeiro contato telefônico com visitante"
              className="h-8 text-xs"
            />
          </div>

          {/* Tolerância & Prazo */}
          <div className="grid gap-3 sm:grid-cols-2">
            {kind !== "without_cell" && kind !== "without_portal_access" && <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-daysThreshold`} className="text-xs font-medium">{kind === "recurring_absence" ? "Dias sem presença registrada" : "Considerar registros dos últimos (dias)"}</Label>
              <Input
                type="number"
                min={1}
                max={180}
                id={`${fieldId}-daysThreshold`}
              value={daysThreshold}
                onChange={(e) => setDaysThreshold(Number(e.target.value))}
                className="h-8 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">
                {kind === "recurring_absence" ? "Ex.: 30 gera tarefa após 30 dias sem presença registrada." : "Ex.: 7 considera os cadastros ou pedidos recebidos nos últimos 7 dias."}
              </span>
            </div>}

            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-dueDays`} className="text-xs font-medium">Prazo para Execução (dias)</Label>
              <Input
                type="number"
                min={0}
                max={60}
                id={`${fieldId}-dueDays`}
              value={dueDays}
                onChange={(e) => setDueDays(Number(e.target.value))}
                className="h-8 text-xs"
              />
              <span className="text-[10px] text-muted-foreground">
                Contado a partir da criação da tarefa. Zero significa prazo para hoje.
              </span>
            </div>
          </div>

          {/* Prioridade & Responsável Padrão */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-priority`} className="text-xs font-medium">Prioridade da Tarefa</Label>
              <select
                id={`${fieldId}-priority`}
              value={priority}
                onChange={(e) => setPriority(e.target.value as PersonFollowUpPriority)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor={`${fieldId}-responsibleId`} className="text-xs font-medium">Responsável Padrão</Label>
              <select
                id={`${fieldId}-responsibleId`}
              value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Sem responsável pré-atribuído</option>
                {responsibleOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Orientações Pastorais */}
          <div className="grid gap-1.5">
            <Label htmlFor={`${fieldId}-notes`} className="text-xs font-medium">Orientações / Observação Padrão</Label>
            <Textarea
              id={`${fieldId}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instruções para o líder ou obreiro que assumir a tarefa..."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={pending || !name.trim()}
            className="text-xs gradient-primary"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar Configuração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
