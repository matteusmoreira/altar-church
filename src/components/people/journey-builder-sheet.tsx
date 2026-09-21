"use client"

import { useState, useTransition } from "react"
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Clock,
  Edit2,
  Loader2,
  Plus,
  Route,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import {
  deleteJourneyStep,
  reorderJourneySteps,
  saveJourneyStep,
  updateMemberJourney,
} from "@/app/(dashboard)/pessoas/actions"
import type { MemberJourneyStep, MemberJourneyWithSteps } from "@/lib/people/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

interface JourneyBuilderSheetProps {
  journey: MemberJourneyWithSteps | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onJourneyChanged?: () => void
}

export function JourneyBuilderSheet({
  journey,
  open,
  onOpenChange,
  onJourneyChanged,
}: JourneyBuilderSheetProps) {
  const [pending, startTransition] = useTransition()

  // Journey settings form
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isAutoEnroll, setIsAutoEnroll] = useState(false)
  const [autoEnrollType, setAutoEnrollType] = useState<"all" | "visitor" | "member">("visitor")

  // Steps state
  const [steps, setSteps] = useState<MemberJourneyStep[]>([])
  const [editingStepId, setEditingStepId] = useState<string | null>(null)
  const [showAddStepForm, setShowAddStepForm] = useState(false)
  const [stepName, setStepName] = useState("")
  const [stepDesc, setStepDesc] = useState("")
  const [stepDays, setStepDays] = useState(7)

  // Sincroniza o formulário com a jornada recebida durante o render, para não
  // commitar um estado intermediário nem disparar render em cascata.
  const [synced, setSynced] = useState<{ journey: MemberJourneyWithSteps | null; open: boolean }>({
    journey: null,
    open: false,
  })
  if (journey && (journey !== synced.journey || open !== synced.open)) {
    setSynced({ journey, open })
    setName(journey.name)
    setDescription(journey.description)
    setIsAutoEnroll(journey.isAutoEnroll)
    setAutoEnrollType(journey.autoEnrollType ?? "visitor")
    setSteps(journey.steps)
    setEditingStepId(null)
    setShowAddStepForm(false)
  }

  const handleSaveJourneySettings = () => {
    if (!journey) return
    if (!name.trim()) {
      toast.error("O nome da jornada é obrigatório")
      return
    }

    startTransition(async () => {
      const res = await updateMemberJourney({
        id: journey.id,
        name: name.trim(),
        description: description.trim(),
        isAutoEnroll,
        autoEnrollType: isAutoEnroll ? autoEnrollType : null,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao salvar configurações da jornada")
        return
      }
      toast.success("Configurações da trilha atualizadas com sucesso!")
      onJourneyChanged?.()
    })
  }

  const handleSaveStep = (e: React.FormEvent) => {
    e.preventDefault()
    if (!journey) return
    if (!stepName.trim()) {
      toast.error("O nome da etapa é obrigatório")
      return
    }

    const currentEditingId = editingStepId
    const currentName = stepName.trim()
    const currentDesc = stepDesc.trim()
    const currentDays = Number(stepDays) || 7

    startTransition(async () => {
      const res = await saveJourneyStep({
        id: currentEditingId,
        journeyId: journey.id,
        name: currentName,
        description: currentDesc,
        estimatedDays: currentDays,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao salvar etapa")
        return
      }
      toast.success(currentEditingId ? "Etapa atualizada!" : "Etapa adicionada à trilha!")
      if (currentEditingId) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === currentEditingId
              ? { ...s, name: currentName, description: currentDesc, estimatedDays: currentDays }
              : s,
          ),
        )
      } else {
        setSteps((prev) => [
          ...prev,
          {
            id: res.id ?? String(Date.now()),
            journeyId: journey.id,
            name: currentName,
            description: currentDesc,
            sortOrder: prev.length + 1,
            estimatedDays: currentDays,
            isActive: true,
          },
        ])
      }
      setStepName("")
      setStepDesc("")
      setStepDays(7)
      setEditingStepId(null)
      setShowAddStepForm(false)
      onJourneyChanged?.()
    })
  }

  const handleEditStep = (step: MemberJourneyStep) => {
    setEditingStepId(step.id)
    setStepName(step.name)
    setStepDesc(step.description)
    setStepDays(step.estimatedDays || 7)
    setShowAddStepForm(true)
  }

  const handleDeleteStep = (stepId: string, stepName: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== stepId))
    startTransition(async () => {
      const res = await deleteJourneyStep(stepId)
      if (!res.ok) {
        toast.error(res.error ?? "Erro ao excluir etapa")
        return
      }
      toast.success(`Etapa "${stepName}" removida`)
      onJourneyChanged?.()
    })
  }

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (!journey) return
    const targetIndex = direction === "up" ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= steps.length) return

    const newSteps = [...steps]
    const temp = newSteps[index]
    newSteps[index] = newSteps[targetIndex]
    newSteps[targetIndex] = temp
    setSteps(newSteps)

    startTransition(async () => {
      const ids = newSteps.map((s) => s.id)
      const res = await reorderJourneySteps(journey.id, ids)
      if (!res.ok) {
        toast.error("Erro ao reordenar etapas")
        return
      }
      onJourneyChanged?.()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col p-6 overflow-y-auto">
        <SheetHeader className="space-y-1 pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-primary" />
            <SheetTitle className="text-lg font-bold">Construtor de Trilha</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            Configure etapas ordenadas, prazos sugeridos e auto-inscrição para novos membros.
          </SheetDescription>
        </SheetHeader>

        {/* Configurações da Jornada */}
        <div className="py-4 border-b border-border/40 space-y-3">
          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Nome da Jornada</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Integração de Novos Convertidos"
              className="h-8 text-xs"
            />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs font-semibold">Descrição / Objetivo</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: Trilha espiritual de acolhimento e batismo"
              className="h-8 text-xs"
            />
          </div>

          <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Inscrição Automática
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Matricular automaticamente pessoas recém-cadastradas nesta trilha.
                </p>
              </div>
              <Switch checked={isAutoEnroll} onCheckedChange={setIsAutoEnroll} />
            </div>

            {isAutoEnroll && (
              <div className="pt-2 border-t border-border/40 grid gap-1.5">
                <Label className="text-[11px] text-muted-foreground">Público da auto-inscrição:</Label>
                <select
                  value={autoEnrollType}
                  onChange={(e) => setAutoEnrollType(e.target.value as "all" | "visitor" | "member")}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="visitor">Apenas Novos Visitantes</option>
                  <option value="member">Apenas Novos Membros</option>
                  <option value="all">Todos os novos cadastros gerais</option>
                </select>
              </div>
            )}
          </div>

          <Button
            size="sm"
            onClick={handleSaveJourneySettings}
            disabled={pending}
            variant="outline"
            className="w-full text-xs h-8"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar Dados da Jornada"}
          </Button>
        </div>

        {/* Gestão de Etapas */}
        <div className="flex-1 space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Etapas da Trilha ({steps.length})
              </h4>
              {journey && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  👥 {journey.enrolledCount} cursando
                </Badge>
              )}
            </div>
            {!showAddStepForm && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingStepId(null)
                  setStepName("")
                  setStepDesc("")
                  setStepDays(7)
                  setShowAddStepForm(true)
                }}
                className="h-7 text-xs gradient-primary"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Etapa
              </Button>
            )}
          </div>

          {/* Formulário de Etapa */}
          {showAddStepForm && (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="p-3.5 space-y-3">
                <h5 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Edit2 className="h-3.5 w-3.5 text-primary" />
                  {editingStepId ? "Editar Etapa" : "Nova Etapa da Trilha"}
                </h5>

                <div className="grid gap-2">
                  <Label className="text-xs">Nome da Etapa *</Label>
                  <Input
                    value={stepName}
                    onChange={(e) => setStepName(e.target.value)}
                    placeholder="Ex.: 1. Ligação de Boas-Vindas ou Batismo"
                    className="h-8 text-xs bg-background"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs">Orientações Pastorais / Descrição</Label>
                  <Textarea
                    value={stepDesc}
                    onChange={(e) => setStepDesc(e.target.value)}
                    placeholder="Instruções para quem for acompanhar este passo..."
                    rows={2}
                    className="text-xs bg-background"
                  />
                </div>

                <div className="grid gap-2">
                  <Label className="text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" /> Prazo Sugerido (dias)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={stepDays}
                    onChange={(e) => setStepDays(Number(e.target.value))}
                    className="h-8 text-xs bg-background w-28"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowAddStepForm(false)
                      setEditingStepId(null)
                    }}
                    className="h-7 text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveStep}
                    disabled={pending || !stepName.trim()}
                    className="h-7 text-xs gradient-primary"
                  >
                    {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar Etapa"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de Etapas */}
          {steps.length === 0 ? (
            <div className="text-center py-10 space-y-2 rounded-lg border border-dashed border-border/60 p-6 bg-muted/10">
              <Route className="h-8 w-8 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium">Nenhuma etapa cadastrada ainda</p>
              <p className="text-xs text-muted-foreground">
                Clique em &quot;Adicionar Etapa&quot; para criar a sequência de passos espirituais da trilha.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/40 bg-muted/20 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                        {idx + 1}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-semibold">{step.name}</p>
                        <Badge variant="outline" className="text-[10px] h-4 px-1 text-muted-foreground">
                          {step.estimatedDays} {step.estimatedDays === 1 ? "dia" : "dias"}
                        </Badge>
                      </div>
                      {step.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      disabled={idx === 0 || pending}
                      onClick={() => handleMoveStep(idx, "up")}
                      title="Mover para cima"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      disabled={idx === steps.length - 1 || pending}
                      onClick={() => handleMoveStep(idx, "down")}
                      title="Mover para baixo"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEditStep(step)}
                      title="Editar etapa"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteStep(step.id, step.name)}
                      disabled={pending}
                      title="Excluir etapa"
                    >
                      <Trash2 className="h-3 w-3" />
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
